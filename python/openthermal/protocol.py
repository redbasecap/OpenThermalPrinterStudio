"""Pure protocol helpers for LX-D02 family BLE thermal printers (no I/O).

Frame layout and handshake are documented in PROTOCOL.md at the repo root.
"""
from __future__ import annotations

SERVICE_UUID = "0000ffe6-0000-1000-8000-00805f9b34fb"
TX_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb"  # host -> printer, write without response
RX_UUID = "0000ffe2-0000-1000-8000-00805f9b34fb"  # printer -> host, notify

WIDTH = 384  # dots per line (58 mm paper, 203 dpi)
LINE_BYTES = WIDTH // 8
LINES_PER_PACKET = 2

# printer -> host opcodes (second byte of a 0x5A frame)
OP_HELLO = 0x01
OP_STATUS = 0x02
OP_PRINT = 0x04
OP_REWIND = 0x05
OP_FINISHED = 0x06
OP_COOLDOWN = 0x07
OP_HOLD = 0x08
OP_CHALLENGE = 0x0A
OP_AUTH = 0x0B
OP_DENSITY = 0x0C


def crc16_xmodem(data: bytes) -> int:
    crc = 0
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def auth_reply(challenge: bytes, mac: bytes) -> bytes:
    """Answer to a 10-byte challenge: high byte of CRC16(challenge[i] || mac)."""
    if len(challenge) != 10 or len(mac) != 6:
        raise ValueError("challenge must be 10 bytes, mac 6 bytes")
    return bytes(crc16_xmodem(bytes([b]) + mac) >> 8 for b in challenge)


def hello_frame() -> bytes:
    return bytes([0x5A, OP_HELLO]) + bytes(10)


def challenge_frame(challenge: bytes) -> bytes:
    return bytes([0x5A, OP_CHALLENGE]) + challenge


def auth_frame(reply: bytes) -> bytes:
    return bytes([0x5A, OP_AUTH]) + reply


def density_frame(level: int) -> bytes:
    if not 1 <= level <= 7:
        raise ValueError("density is 1..7")
    return bytes([0x5A, OP_DENSITY, level])


def print_frame(count: int, end: bool) -> bytes:
    return bytes([0x5A, OP_PRINT, (count >> 8) & 0xFF, count & 0xFF, 1 if end else 0, 0])


def mac_from_hello(resp: bytes) -> bytes:
    return bytes(resp[4:10])


def parse_status(resp: bytes) -> dict:
    return {"battery": resp[2], "no_paper": resp[3] != 0, "charging": resp[4] == 1}


def rewind_index(resp: bytes) -> int:
    """0x05 carries a 1-based packet index; resume from the 0-based one before it."""
    return max(0, (resp[2] << 8 | resp[3]) - 1)


def pack_rows(rows: list[list[bool]]) -> list[bytes]:
    """Rows of WIDTH booleans (True = black) -> raster packets."""
    rows = list(rows)
    rows += [[False] * WIDTH] * (LINES_PER_PACKET - len(rows) % LINES_PER_PACKET)
    packets = []
    for i in range(len(rows) // LINES_PER_PACKET):
        pkt = bytearray([0x55, (i >> 8) & 0xFF, i & 0xFF])
        for row in rows[i * LINES_PER_PACKET:(i + 1) * LINES_PER_PACKET]:
            line = bytearray(LINE_BYTES)
            for x, black in enumerate(row[:WIDTH]):
                if black:
                    line[x // 8] |= 1 << (7 - x % 8)
            pkt += line
        pkt.append(0x00)
        packets.append(bytes(pkt))
    return packets
