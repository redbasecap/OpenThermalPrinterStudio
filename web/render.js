// Render banners, labels and images into 384-dot 1-bit bitmaps.
import { WIDTH } from "./protocol.js";

const canvas = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });

// Grayscale canvas -> { bits, height } with 1 = black.
function toBits(cv, { dither = false, threshold = 128, invert = false } = {}) {
  const { width, height } = cv;
  const px = cv.getContext("2d").getImageData(0, 0, width, height).data;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const a = px[i * 4 + 3] / 255;
    const g = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    gray[i] = invert ? 255 - (g * a + 255 * (1 - a)) : g * a + 255 * (1 - a);
  }
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const black = gray[i] < threshold;
      bits[i] = black ? 1 : 0;
      if (!dither) continue;
      const err = gray[i] - (black ? 0 : 255);
      if (x + 1 < width) gray[i + 1] += (err * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) gray[i + width - 1] += (err * 3) / 16;
        gray[i + width] += (err * 5) / 16;
        if (x + 1 < width) gray[i + width + 1] += err / 16;
      }
    }
  }
  return { bits, height };
}

// Text running along the strip: letters as tall as the paper is wide.
export function banner(text, { font = "Archivo Black", weight = 400, border = true } = {}) {
  const size = 260, pad = 40;
  const probe = canvas(1, 1).getContext("2d");
  probe.font = `${weight} ${size}px "${font}"`;
  const m = probe.measureText(text || " ");
  const textW = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
  const textH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  const len = textW + pad * 2;

  const flat = canvas(len, WIDTH);
  const f = flat.getContext("2d");
  f.fillStyle = "#fff"; f.fillRect(0, 0, len, WIDTH);
  f.fillStyle = "#000"; f.strokeStyle = "#000";
  if (border) { f.lineWidth = 8; f.strokeRect(8, 8, len - 16, WIDTH - 16); }
  f.font = probe.font;
  f.fillText(text, pad + m.actualBoundingBoxLeft, (WIDTH - textH) / 2 + m.actualBoundingBoxAscent);

  // rotate 90° counter-clockwise: the text reads bottom to top along the strip
  const out = canvas(WIDTH, len);
  const o = out.getContext("2d");
  o.translate(0, len);
  o.rotate(-Math.PI / 2);
  o.drawImage(flat, 0, 0);
  return toBits(out);
}

// Horizontal lines across the paper at the chosen size; a line too wide for
// the paper is shrunk on its own, so short lines keep the full size.
export function label(text, { font = "Archivo Black", weight = 400, size = 64, align = "center", border = false } = {}) {
  const ctx = canvas(1, 1).getContext("2d");
  const margin = border ? 24 : 12;
  const spec = (s) => `${weight} ${s}px "${font}"`;
  const lines = (text || " ").split("\n").map((l) => {
    let s = size;
    for (; s > 10; s -= 2) {
      ctx.font = spec(s);
      if (ctx.measureText(l).width <= WIDTH - margin * 2) break;
    }
    return { text: l, size: s, lh: Math.round(s * 1.2) };
  });
  const h = lines.reduce((sum, l) => sum + l.lh, 0) + margin * 2;
  const cv = canvas(WIDTH, h);
  const c = cv.getContext("2d");
  c.fillStyle = "#fff"; c.fillRect(0, 0, WIDTH, h);
  c.fillStyle = "#000";
  c.textBaseline = "middle";
  c.textAlign = align;
  const x = align === "left" ? margin : align === "right" ? WIDTH - margin : WIDTH / 2;
  let y = margin;
  for (const l of lines) {
    c.font = spec(l.size);
    c.fillText(l.text, x, y + l.lh / 2);
    y += l.lh;
  }
  if (border) { c.lineWidth = 6; c.strokeRect(6, 6, WIDTH - 12, h - 12); }
  return { ...toBits(cv), shrunk: lines.filter((l) => l.size < size).length };
}

export function picture(img, { dither = true, threshold = 128, invert = false } = {}) {
  const h = Math.max(1, Math.round((img.naturalHeight * WIDTH) / img.naturalWidth));
  const cv = canvas(WIDTH, h);
  const c = cv.getContext("2d");
  c.fillStyle = "#fff"; c.fillRect(0, 0, WIDTH, h);
  c.drawImage(img, 0, 0, WIDTH, h);
  return toBits(cv, { dither, threshold, invert });
}

// 1-bit bitmap -> canvas for preview / PNG export (paper white, ink near-black).
export function drawBits(cv, { bits, height }, ink = [24, 26, 28], paper = [252, 252, 249]) {
  cv.width = WIDTH; cv.height = height;
  const c = cv.getContext("2d");
  const im = c.createImageData(WIDTH, height);
  for (let i = 0; i < bits.length; i++) {
    const col = bits[i] ? ink : paper;
    im.data.set(col, i * 4); im.data[i * 4 + 3] = 255;
  }
  c.putImageData(im, 0, 0);
}
