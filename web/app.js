import { packBits, WIDTH } from "./protocol.js";
import { ThermalPrinter } from "./printer.js";
import * as R from "./render.js";

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
      ? R.banner($("banner-text").value, { font: f.family, weight: f.weight, border: $("banner-border").checked })
      : R.label($("label-text").value, {
          font: f.family, weight: f.weight, size: +$("label-size").value,
          align: $("label-align").value, border: $("label-border").checked,
        });
  }
  if (!bitmap) {
    R.drawBits($("preview"), { bits: new Uint8Array(WIDTH * 160), height: 160 });
    $("meta").textContent = "Choose a picture to see it on paper";
    return;
  }
  R.drawBits($("preview"), bitmap);
  const cm = (bitmap.height / 80).toFixed(1);
  $("meta").textContent = `${cm} cm · ${bitmap.height} lines · 58 mm paper`;
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

$("print").addEventListener("click", async () => {
  if (busy || !bitmap) return;
  if (!printer.connected && !(await connect())) return;
  busy = true;
  $("print").disabled = true;
  $("print").textContent = "Printing…";
  const head = $("head");
  head.hidden = false;
  try {
    await printer.print(packBits(bitmap.bits, bitmap.height), {
      density: +$("density").value,
      onProgress: (sent, total) => {
        head.style.top = `calc(4px + ${(sent / total) * 100}% - ${(sent / total) * 18}px)`;
      },
    });
  } catch (err) {
    log(err.message, true);
  } finally {
    busy = false;
    head.hidden = true;
    $("print").disabled = false;
    $("print").textContent = "Print";
  }
});

$("save").addEventListener("click", () => {
  if (!bitmap) return;
  const a = document.createElement("a");
  a.download = `${mode}.png`;
  a.href = $("preview").toDataURL("image/png");
  a.click();
});

if (!ThermalPrinter.supported) {
  $("unsupported").hidden = false;
  $("connect").disabled = true;
}
render();
