"""BLE transport and print job loop (requires bleak)."""
from __future__ import annotations

import asyncio
import random
from typing import Callable

from bleak import BleakClient, BleakScanner

from . import protocol as P

Log = Callable[[str], None]


async def find_printer(name_prefix: str = "LX", timeout: float = 20):
    return await BleakScanner.find_device_by_filter(
        lambda d, a: bool(a.local_name) and a.local_name.upper().startswith(name_prefix.upper()),
        timeout=timeout,
    )


async def print_packets(packets: list[bytes], density: int = 3, name_prefix: str = "LX",
                        log: Log = print) -> None:
    dev = await find_printer(name_prefix)
    if not dev:
        raise RuntimeError("no printer found (switched on? phone app disconnected?)")
    log(f"found {dev.name}")

    waiters: dict[bytes, asyncio.Future] = {}
    events: asyncio.Queue[bytes] = asyncio.Queue()

    def on_notify(_, data: bytearray) -> None:
        data = bytes(data)
        fut = waiters.pop(data[:2], None)
        if fut and not fut.done():
            fut.set_result(data)
        else:
            events.put_nowait(data)

    async with BleakClient(dev) as c:
        await c.start_notify(P.RX_UUID, on_notify)
        loop = asyncio.get_running_loop()

        async def cmd(frame: bytes) -> bytes:
            fut = loop.create_future()
            waiters[frame[:2]] = fut
            await c.write_gatt_char(P.TX_UUID, frame, response=False)
            return await asyncio.wait_for(fut, 3)

        mac = P.mac_from_hello(await cmd(P.hello_frame()))
        challenge = bytes(random.randint(1, 254) for _ in range(10))
        await cmd(P.challenge_frame(challenge))
        auth = await cmd(P.auth_frame(P.auth_reply(challenge, mac)))
        if auth[2] != 1:
            raise RuntimeError("printer refused authentication")
        log("authenticated")
        await cmd(P.density_frame(density))

        n = len(packets)
        await cmd(P.print_frame(n, end=False))
        log(f"sending {n} packets")

        idx, hold, done, delay = 0, False, False, 0.015
        deadline = loop.time() + 60 + n * 0.1
        while not done and loop.time() < deadline:
            batch = []
            if hold or idx >= n:
                try:
                    batch.append(await asyncio.wait_for(events.get(), 30))
                except asyncio.TimeoutError:
                    break
            while not events.empty():
                batch.append(events.get_nowait())
            for ev in batch:
                op = ev[1]
                if op == P.OP_REWIND:
                    idx, hold = P.rewind_index(ev), False
                    log(f"rewind to {idx}")
                elif op == P.OP_HOLD:
                    if not hold:
                        delay = min(delay * 1.5, 0.06)
                        log("hold")
                    hold = True
                elif op == P.OP_COOLDOWN:
                    await asyncio.sleep(0.1)
                elif op == P.OP_FINISHED:
                    done = True
                elif op == P.OP_STATUS and P.parse_status(ev)["no_paper"]:
                    log("warning: printer reports no paper")
            if done or hold or idx >= n:
                continue
            await c.write_gatt_char(P.TX_UUID, packets[idx], response=False)
            idx += 1
            await asyncio.sleep(delay)

        if not done:
            raise RuntimeError("printer did not report completion")
        await cmd(P.print_frame(n, end=True))
        log("done")
