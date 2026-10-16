import { packBits, repeatBits, WIDTH } from "./protocol.js";
import { ThermalPrinter } from "./printer.js";
import * as R from "./render.js";
import { loadStickers, svgFor, STICKERS } from "./stickers.js";

const $ = (id) => document.getElementById(id);
const FONTS = [
  { label: "Archivo Black", family: "Archivo Black", weight: 400 },
  { label: "Bricolage Grotesque", family: "Bricolage Grotesque", weight: 800 },
  { label: "IBM Plex Mono", family: "IBM Plex Mono", weight: 600 },
  { label: "Pacifico", family: "Pacifico", weight: 400 },
];

const printer = new ThermalPrinter();
let mode = "banner";
let picture = null;
let bitmap = null;
let busy = false;
let stickers = new Map();

for (const sel of document.querySelectorAll(".font-select")) {
  sel.innerHTML = FONTS.map((f, i) => `<option value="${i}">${f.label}</option>`).join("");
}

function log(msg, err = false) {
  const li = document.createElement("li");
  li.textContent = msg;
  if (err) li.className = "err";
  $("log").append(li);
  $("log").scrollTop = $("log").scrollHeight;
}

const copies = () => Math.min(50, Math.max(1, Math.round(+$("copies").value) || 1));

async function render() {
  if (mode === "image") {
    bitmap = picture
      ? R.picture(picture, {
          dither: $("image-dither").checked,
          threshold: +$("image-threshold").value,
          invert: $("image-invert").checked,
        })
      : null;
  } else {
    const f = FONTS[$(`${mode}-font`).value];
    await document.fonts.load(`${f.weight} 64px "${f.family}"`);
    bitmap = mode === "banner"
      ? R.banner($("banner-text").value, {
          font: f.family, weight: f.weight, size: +$("banner-size").value, border: $("banner-border").checked, stickers,
        })
      : R.label($("label-text").value, {
          font: f.family, weight: f.weight, size: +$("label-size").value,
          align: $("label-align").value, border: $("label-border").checked, stickers,
        });
  }
  if (!bitmap) {
    R.drawBits($("preview"), { bits: new Uint8Array(WIDTH * 160), height: 160 });
    $("meta").textContent = "Choose a picture to see it on paper";
    return;
  }
  R.drawBits($("preview"), bitmap);
  const cm = (bitmap.height / 80).toFixed(1);
  const fit = !bitmap.shrunk ? ""
    : mode === "banner" ? " · letters shrunk to fit the paper width"
    : ` · ${bitmap.shrunk} text line${bitmap.shrunk > 1 ? "s" : ""} shrunk to fit`;
  const n = copies();
  const total = n > 1 ? ` · ${n} copies, ${(repeatBits(bitmap, n).height / 80).toFixed(1)} cm in total` : "";
  $("meta").textContent = `${cm} cm · ${bitmap.height} lines · 58 mm paper${fit}${total}`;
}

// mode tabs
document.querySelectorAll("[data-mode]").forEach((tab) =>
  tab.addEventListener("click", () => {
    mode = tab.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((t) => t.setAttribute("aria-selected", t === tab));
    document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== mode));
    render();
  })
);

// live preview on every control change
document.querySelector(".composer").addEventListener("input", (e) => {
  const out = $(`${e.target.id}-out`);
  if (out) out.textContent = e.target.value;
  if (e.target.id !== "density") render();
  if (e.target.id === "copies") $("print").textContent = printLabel();
});
document.querySelector(".composer").addEventListener("change", (e) => {
  if (e.target.matches("select, input[type=checkbox]")) render();
});

// pictures: file picker and drag & drop
function loadPicture(file) {
  if (!file?.type.startsWith("image/")) return log("That file is not a picture.", true);
  const img = new Image();
  img.onload = () => {
    picture = img;
    drop.querySelector("strong").textContent = file.name;
    render();
  };
  img.src = URL.createObjectURL(file);
}
$("image-file").addEventListener("change", (e) => loadPicture(e.target.files[0]));
const drop = $("drop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault(); drop.classList.remove("over");
  loadPicture(e.dataTransfer.files[0]);
});

// printer connection
printer.addEventListener("log", (e) => log(e.detail));
printer.addEventListener("status", (e) => {
  $("battery").hidden = false;
  $("battery").textContent = `${e.detail.battery}%${e.detail.charging ? " ⚡" : ""}`;
});
printer.addEventListener("disconnect", () => {
  $("connect").classList.remove("on");
  $("connect-label").textContent = "Connect printer";
  $("battery").hidden = true;
  log("Printer disconnected");
});

async function connect() {
  if (!ThermalPrinter.supported) {
    log("Printing needs Chrome or Edge. Save a PNG and print it with the otps command instead.", true);
    return false;
  }
  try {
    const name = await printer.connect();
    $("connect").classList.add("on");
    $("connect-label").textContent = name;
    return true;
  } catch (err) {
    if (err.name !== "NotFoundError") log(err.message, true); // NotFoundError = chooser cancelled
    return false;
  }
}

$("connect").addEventListener("click", () => (printer.connected ? printer.disconnect() : connect()));

const printLabel = () => (copies() > 1 ? `Print ${copies()} copies` : "Print");

async function printNow() {
  if (busy || !bitmap) return;
  if (!printer.connected && !(await connect())) return;
  busy = true;
  $("print").disabled = true;
  $("print").textContent = "Printing…";
  const head = $("head");
  head.hidden = false;
  try {
    const job = repeatBits(bitmap, copies());
    await printer.print(packBits(job.bits, job.height), {
      density: +$("density").value,
      onProgress: (sent, total) => {
        head.style.top = `calc(4px + ${(sent / total) * 100}% - ${(sent / total) * 18}px)`;
      },
    });
    remember();
  } catch (err) {
    log(err.message, true);
  } finally {
    busy = false;
    head.hidden = true;
    $("print").disabled = false;
    $("print").textContent = printLabel();
  }
}
$("print").addEventListener("click", printNow);

$("save").addEventListener("click", () => {
  if (!bitmap) return;
  const a = document.createElement("a");
  a.download = `${mode}.png`;
  a.href = $("preview").toDataURL("image/png");
  a.click();
  remember();
});

// sticker palettes: insert :name: at the cursor
function insertSticker(field, name) {
  const token = `:${name}:`;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  field.setRangeText(token, start, end, "end");
  field.focus();
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
for (const box of document.querySelectorAll(".stickers")) {
  const field = $(box.dataset.for);
  for (const name of Object.keys(STICKERS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.title = `Insert ${name}`;
    b.setAttribute("aria-label", `Insert ${name}`);
    b.innerHTML = `<img alt="" src="data:image/svg+xml,${encodeURIComponent(svgFor(name))}">`;
    b.addEventListener("click", () => insertSticker(field, name));
    box.append(b);
  }
}

// recent texts, kept in this browser only
const STORE = "otps.recent";
const MAX_RECENT = 30;
let recent = [];
let undoTimer = null;
try { recent = JSON.parse(localStorage.getItem(STORE)) || []; } catch { recent = []; }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(recent)); } catch {} };

function currentEntry() {
  if (mode === "image") return null;
  const text = $(`${mode}-text`).value;
  if (!text.trim()) return null;
  return {
    mode, text,
    font: +$(`${mode}-font`).value,
    size: +$(`${mode}-size`).value,
    border: $(`${mode}-border`).checked,
    align: mode === "label" ? $("label-align").value : undefined,
  };
}

function remember() {
  const e = currentEntry();
  if (!e) return;
  recent = recent.filter((r) => !(r.mode === e.mode && r.text === e.text));
  recent.unshift({ ...e, at: Date.now() });
  recent.length = Math.min(recent.length, MAX_RECENT);
  persist();
  showRecent();
}

async function applyEntry(e) {
  document.querySelector(`[data-mode="${e.mode}"]`).click();
  $(`${e.mode}-text`).value = e.text;
  $(`${e.mode}-font`).value = e.font ?? 0;
  if (e.size) { $(`${e.mode}-size`).value = e.size; $(`${e.mode}-size-out`).textContent = e.size; }
  $(`${e.mode}-border`).checked = !!e.border;
  if (e.align) $("label-align").value = e.align;
  await render();
}

function deleteEntry(i) {
  const [gone] = recent.splice(i, 1);
  persist();
  showRecent();
  clearTimeout(undoTimer);
  $("undo-text").textContent = `Deleted “${gone.text.split("\n")[0].slice(0, 28)}”`;
  $("undo").hidden = false;
  $("undo-btn").onclick = () => {
    recent.splice(Math.min(i, recent.length), 0, gone);
    persist();
    showRecent();
    $("undo").hidden = true;
  };
  undoTimer = setTimeout(() => ($("undo").hidden = true), 8000);
}

function showRecent() {
  const list = $("recent");
  list.replaceChildren();
  $("recent-empty").hidden = recent.length > 0;
  recent.forEach((e, i) => {
    const li = document.createElement("li");
    const info = document.createElement("div");
    info.className = "recent-text";
    const title = document.createElement("strong");
    title.textContent = e.text.replace(/\n/g, " · ");
    const sub = document.createElement("span");
    sub.textContent = `${e.mode === "banner" ? "Banner" : "Label"} · ${new Date(e.at).toLocaleDateString()}`;
    info.append(title, sub);
    const btn = (label, cls, fn, aria) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label;
      if (cls) b.className = cls;
      b.setAttribute("aria-label", `${aria} “${e.text.split("\n")[0]}”`);
      b.addEventListener("click", fn);
      return b;
    };
    li.append(
      info,
      btn("Print", "again", async () => { await applyEntry(e); printNow(); }, "Print again"),
      btn("Edit", "", async () => { await applyEntry(e); $(`${e.mode}-text`).focus(); }, "Edit"),
      btn("Delete", "", () => deleteEntry(i), "Delete"),
    );
    list.append(li);
  });
}

if (!ThermalPrinter.supported) {
  $("unsupported").hidden = false;
  $("connect").disabled = true;
}
showRecent();
loadStickers().then((m) => { stickers = m; render(); });
render();
