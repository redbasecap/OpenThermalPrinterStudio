// Web Bluetooth transport and print job loop. Chrome / Edge only, needs https or localhost.
import * as P from "./protocol.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ThermalPrinter extends EventTarget {
  device = null;
  tx = null;
  rx = null;
  #waiters = new Map();
  #events = [];
  #wake = null;

  static get supported() {
    return "bluetooth" in navigator;
  }

  get connected() {
    return !!this.device?.gatt?.connected;
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async connect(namePrefix = "LX") {
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix }],
      optionalServices: [P.SERVICE_UUID],
    });
    this.device.addEventListener("gattserverdisconnected", () => this.#emit("disconnect"));
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(P.SERVICE_UUID);
    this.tx = await service.getCharacteristic(P.TX_UUID);
    this.rx = await service.getCharacteristic(P.RX_UUID);
    this.rx.addEventListener("characteristicvaluechanged", (e) => this.#onNotify(e.target.value));
    await this.rx.startNotifications();
    this.#emit("log", `Connected to ${this.device.name}`);
    return this.device.name;
  }

  disconnect() {
    this.device?.gatt?.disconnect();
  }

  #onNotify(view) {
    const data = new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
    if (data[0] !== 0x5a) return;
    if (data[1] === P.OP.STATUS) this.#emit("status", P.parseStatus(data));
    const waiter = this.#waiters.get(data[1]);
    if (waiter) {
      this.#waiters.delete(data[1]);
      waiter(data);
      return;
    }
    this.#events.push(data);
    this.#wake?.();
  }

  #write(bytes) {
    return this.tx.writeValueWithoutResponse(bytes);
  }

  async #cmd(bytes, timeout = 3000) {
    const reply = new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.#waiters.delete(bytes[1]);
        reject(new Error(`Printer did not answer command 5a ${bytes[1].toString(16)}`));
      }, timeout);
      this.#waiters.set(bytes[1], (d) => { clearTimeout(t); resolve(d); });
    });
    await this.#write(bytes);
    return reply;
  }

  #nextEvent(timeout) {
    if (this.#events.length) return Promise.resolve(this.#events.shift());
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.#wake = null; resolve(null); }, timeout);
      this.#wake = () => { clearTimeout(t); this.#wake = null; resolve(this.#events.shift()); };
    });
  }

  async #handshake(density) {
    const mac = P.macFromHello(await this.#cmd(P.helloFrame()));
    const challenge = P.randomChallenge();
    await this.#cmd(P.challengeFrame(challenge));
    const auth = await this.#cmd(P.authFrame(P.authReply(challenge, mac)));
    if (auth[2] !== 1) throw new Error("Printer refused the handshake. Switch it off and on, then connect again.");
    await this.#cmd(P.densityFrame(density));
  }

  // packets: from P.packBits. onProgress(sent, total) drives the UI.
  async print(packets, { density = 3, onProgress = () => {} } = {}) {
    if (!this.connected) throw new Error("Connect a printer first.");
    this.#events = [];
    await this.#handshake(density);
    const n = packets.length;
    await this.#cmd(P.printFrame(n, false));
    this.#emit("log", `Sending ${n} lines`);

    let idx = 0, hold = false, done = false, delay = 15;
    const deadline = Date.now() + 60000 + n * 100;
    while (!done && Date.now() < deadline) {
      const batch = [];
      if (hold || idx >= n) {
        const ev = await this.#nextEvent(30000);
        if (!ev) break;
        batch.push(ev);
      }
      while (this.#events.length) batch.push(this.#events.shift());
      for (const ev of batch) {
        switch (ev[1]) {
          case P.OP.REWIND:
            idx = P.rewindIndex(ev); hold = false;
            this.#emit("log", `Resending from line ${idx * 2}`);
            break;
          case P.OP.HOLD:
            if (!hold) { delay = Math.min(delay * 1.5, 60); this.#emit("log", "Printer buffer full, pausing"); }
            hold = true;
            break;
          case P.OP.COOLDOWN:
            await sleep(100);
            break;
          case P.OP.FINISHED:
            done = true;
            break;
        }
      }
      if (done || hold || idx >= n) continue;
      await this.#write(packets[idx]);
      idx++;
      onProgress(idx, n);
      await sleep(delay);
    }
    if (!done) throw new Error("Printer stopped answering before the job finished.");
    await this.#cmd(P.printFrame(n, true));
    onProgress(n, n);
    this.#emit("log", "Printed");
  }
}
