# LX-D02 family BLE protocol

What this project relies on, verified against a real LX-D02 (firmware as shipped in 2026).
Prior work: [rusq/thermoprint](https://github.com/rusq/thermoprint) (frame layout, flow control)
and [antoniosolismz/Pocketprint](https://github.com/antoniosolismz/Pocketprint) (handshake).

## Transport

| | UUID | |
|---|---|---|
| Service | `0000ffe6-0000-1000-8000-00805f9b34fb` | must be listed in Web Bluetooth `optionalServices` |
| TX | `0000ffe1-…` | host → printer, write **without** response |
| RX | `0000ffe2-…` | printer → host, notify |

The printer advertises a name starting with `LX` and no service UUID. A raster frame is
100 bytes, so the link needs an MTU of at least 103 (macOS and Chrome negotiate 128 on their own).

## Host → printer

| Frame | Bytes |
|---|---|
| Hello | `5A 01` + 10 × `00` |
| Challenge | `5A 0A` + 10 random bytes (1..254) |
| Auth reply | `5A 0B` + 10 bytes, see below |
| Density | `5A 0C <1..7>` (3 is a good default) |
| Job start | `5A 04 <packets:u16be> 00 00` |
| Raster | `55 <index:u16be> <2 × 48 bytes> 00` |
| Job end | `5A 04 <packets:u16be> 01 00` |

Raster rows are 384 dots, MSB first, `1` = black. Two rows per packet; the image is padded
with blank rows up to the next even height (an even height gets one extra blank packet).

## Printer → host

| Frame | Meaning |
|---|---|
| `5A 01` | hello reply, MAC in bytes `[4..10)` |
| `5A 02` | heartbeat about every 2 s: `[2]` battery %, `[3]` ≠ 0 no paper, `[4]` 1 charging / 2 charged |
| `5A 05 <n:u16be>` | packet lost: resend from `n − 1` (n is 1-based); also ends a hold |
| `5A 06` | job finished printing |
| `5A 07` | cooldown: wait ~100 ms, keep position |
| `5A 08` | hold, buffer full: send nothing until `5A 05` or `5A 06` |
| `5A 0B` | auth result, `[2] == 01` accepted |

## Handshake

Without it the printer acknowledges every command but silently ignores raster data.

```
mac       = hello_reply[4:10]                    # 6 bytes
reply[i]  = CRC16_XMODEM(challenge[i] || mac) >> 8
```

CRC-16/XMODEM: poly `0x1021`, init `0`, no reflection, no final xor.

## Job sequence

```
hello → challenge → auth reply (expect 01) → density → job start
  → raster packets ~15 ms apart, obey 05 / 07 / 08
  ← 06 finished
→ job end
```

On each hold, slow down by 1.5× (cap 60 ms). A 48 cm banner (1934 packets) typically sees
about eight hold/rewind cycles and takes a couple of minutes.
