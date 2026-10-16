"""Regenerate vectors/vectors.json, the shared fixtures for the Python and JS tests."""
import json
import pathlib
import random
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from openthermal import protocol as P  # noqa: E402

rng = random.Random(42)
macs = ["112233445566", "a2ff00010203", "000000000000"]
auth = []
for mac in macs:
    for _ in range(3):
        ch = bytes(rng.randint(1, 254) for _ in range(10))
        auth.append({"mac": mac, "challenge": ch.hex(),
                     "reply": P.auth_reply(ch, bytes.fromhex(mac)).hex()})

def pattern(h):
    return [[(x + y) % 7 == 0 or x < y for x in range(P.WIDTH)] for y in range(h)]

raster = [{"height": h, "packets": [p.hex() for p in P.pack_rows(pattern(h))]} for h in (1, 2, 5)]
frames = {
    "hello": P.hello_frame().hex(),
    "density3": P.density_frame(3).hex(),
    "start1934": P.print_frame(1934, end=False).hex(),
    "end1934": P.print_frame(1934, end=True).hex(),
}
out = pathlib.Path(__file__).resolve().parents[2] / "vectors" / "vectors.json"
out.write_text(json.dumps({"crc": [{"data": "313233343536373839", "crc": P.crc16_xmodem(b"123456789")}],
                           "auth": auth, "frames": frames, "raster": raster}, indent=1))
print("wrote", out)
