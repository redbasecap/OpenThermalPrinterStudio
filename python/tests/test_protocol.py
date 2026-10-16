import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from openthermal import protocol as P  # noqa: E402

V = json.loads((pathlib.Path(__file__).resolve().parents[2] / "vectors" / "vectors.json").read_text())


def test_crc_check_value():
    # standard CRC-16/XMODEM check value for "123456789"
    assert P.crc16_xmodem(b"123456789") == 0x31C3


def test_auth_vectors():
    for v in V["auth"]:
        got = P.auth_reply(bytes.fromhex(v["challenge"]), bytes.fromhex(v["mac"]))
        assert got.hex() == v["reply"]


def test_frames():
    assert P.hello_frame().hex() == V["frames"]["hello"] == "5a01" + "00" * 10
    assert P.print_frame(1934, False).hex() == "5a04078e0000"
    assert P.print_frame(1934, True).hex() == "5a04078e0100"
    assert P.density_frame(3).hex() == "5a0c03"


def test_raster_layout():
    pk = P.pack_rows([[True] + [False] * 383])
    assert len(pk) == 1 and len(pk[0]) == 100
    assert pk[0][:4] == bytes([0x55, 0, 0, 0x80]) and pk[0][-1] == 0
    assert len(P.pack_rows([[False] * 384] * 2)) == 2  # even height gets a blank trailer packet
    assert P.pack_rows([[False] * 384] * 600)[300][1:3] == bytes([0x01, 0x2C])


def test_mac_and_rewind():
    hello = bytes.fromhex("5a0100031122334455660100")
    assert P.mac_from_hello(hello).hex() == "112233445566"
    assert P.rewind_index(bytes.fromhex("5a0500830100")) == 130


def test_raster_vectors():
    from make_vectors import pattern
    for v in V["raster"]:
        assert [p.hex() for p in P.pack_rows(pattern(v["height"]))] == v["packets"]


def test_repeat_rows():
    row = [True] * 384
    assert P.repeat_rows([row], 1) == [row]
    out = P.repeat_rows([row, row], 3, gap=5)
    assert len(out) == 2 * 3 + 5 * 2
    assert out[2] == [False] * 384 and out[7] == row
