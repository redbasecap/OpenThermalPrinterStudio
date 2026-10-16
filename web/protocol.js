// Pure protocol helpers for LX-D02 family BLE thermal printers (no I/O).
// Mirrors python/openthermal/protocol.py; both are checked against vectors/vectors.json.

export const SERVICE_UUID = "0000ffe6-0000-1000-8000-00805f9b34fb";
export const TX_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";
export const RX_UUID = "0000ffe2-0000-1000-8000-00805f9b34fb";

export const WIDTH = 384;
export const LINE_BYTES = WIDTH / 8;
export const LINES_PER_PACKET = 2;

export const OP = {
  HELLO: 0x01, STATUS: 0x02, PRINT: 0x04, REWIND: 0x05, FINISHED: 0x06,
  COOLDOWN: 0x07, HOLD: 0x08, CHALLENGE: 0x0a, AUTH: 0x0b, DENSITY: 0x0c,
};

export function crc16xmodem(bytes) {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

// Answer to a 10-byte challenge: high byte of CRC16(challenge[i] || mac).
export function authReply(challenge, mac) {
  if (challenge.length !== 10 || mac.length !== 6) throw new Error("challenge must be 10 bytes, mac 6 bytes");
  return Uint8Array.from(challenge, (b) => crc16xmodem([b, ...mac]) >> 8);
}

const frame = (op, ...rest) => Uint8Array.from([0x5a, op, ...rest]);
export const helloFrame = () => frame(OP.HELLO, ...new Array(10).fill(0));
export const challengeFrame = (challenge) => frame(OP.CHALLENGE, ...challenge);
export const authFrame = (reply) => frame(OP.AUTH, ...reply);
export function densityFrame(level) {
  if (level < 1 || level > 7) throw new Error("density is 1..7");
  return frame(OP.DENSITY, level);
}
export const printFrame = (count, end) => frame(OP.PRINT, (count >> 8) & 0xff, count & 0xff, end ? 1 : 0, 0);

export const macFromHello = (resp) => resp.slice(4, 10);
export const parseStatus = (resp) => ({ battery: resp[2], noPaper: resp[3] !== 0, charging: resp[4] === 1 });
// 0x05 carries a 1-based packet index; resume from the 0-based one before it.
export const rewindIndex = (resp) => Math.max(0, ((resp[2] << 8) | resp[3]) - 1);

export const randomChallenge = () => Uint8Array.from({ length: 10 }, () => 1 + Math.floor(Math.random() * 254));

// bits: Uint8Array of WIDTH*height, 1 = black. Returns raster packets.
export function packBits(bits, height) {
  const padded = height + (LINES_PER_PACKET - (height % LINES_PER_PACKET));
  const packets = [];
  for (let i = 0; i < padded / LINES_PER_PACKET; i++) {
    const pkt = new Uint8Array(3 + LINE_BYTES * LINES_PER_PACKET + 1);
    pkt[0] = 0x55; pkt[1] = (i >> 8) & 0xff; pkt[2] = i & 0xff;
    for (let l = 0; l < LINES_PER_PACKET; l++) {
      const y = i * LINES_PER_PACKET + l;
      if (y >= height) continue;
      for (let x = 0; x < WIDTH; x++) {
        if (bits[y * WIDTH + x]) pkt[3 + l * LINE_BYTES + (x >> 3)] |= 1 << (7 - (x & 7));
      }
    }
    packets.push(pkt);
  }
  return packets;
}

export const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
export const fromHex = (s) => Uint8Array.from(s.match(/../g) || [], (h) => parseInt(h, 16));

// Repeat a bitmap for several copies in one job, with blank rows between them
// (80 rows = 1 cm) so the copies can be torn apart.
export function repeatBits({ bits, height }, copies, gap = 80) {
  if (copies <= 1) return { bits, height };
  const total = height * copies + gap * (copies - 1);
  const out = new Uint8Array(WIDTH * total);
  for (let i = 0; i < copies; i++) out.set(bits, WIDTH * i * (height + gap));
  return { bits: out, height: total };
}
