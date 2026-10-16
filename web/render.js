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

// Lay out one line of text with inline :sticker: tokens, relative to its baseline.
const TOKEN = /(:[a-z]+:)/;
function layout(ctx, line, font, s, stickers) {
  ctx.font = font;
  const d = s * 0.8; // sticker box, roughly cap height plus a little
  const segs = [];
  let width = 0, top = 0, bottom = 0;
  for (const part of line.split(TOKEN)) {
    if (!part) continue;
    const img = TOKEN.test(part) && stickers?.get(part.slice(1, -1));
    if (img) {
      segs.push({ img, w: d + s * 0.16 });
      width += d + s * 0.16;
      top = Math.min(top, -s * 0.76);
      bottom = Math.max(bottom, s * 0.04);
    } else {
      const m = ctx.measureText(part);
      segs.push({ str: part, w: m.width });
      width += m.width;
      top = Math.min(top, -m.actualBoundingBoxAscent);
      bottom = Math.max(bottom, m.actualBoundingBoxDescent);
    }
  }
  if (!segs.length) top = -s * 0.7;
  return { segs, width, top, bottom, s, d, font };
}

function drawLine(ctx, L, x, baseline) {
  ctx.font = L.font;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  for (const seg of L.segs) {
    if (seg.str) ctx.fillText(seg.str, x, baseline);
    else ctx.drawImage(seg.img, x + L.s * 0.08, baseline - L.s * 0.76, L.d, L.d);
    x += seg.w;
  }
}

// Text running along the strip. size is the font size in dots; letters taller
// than the paper is wide are shrunk until they fit across it.
export function banner(text, { font = "Archivo Black", weight = 400, size = 260, border = true, stickers } = {}) {
  const avail = WIDTH - (border ? 48 : 16);
  const probe = canvas(1, 1).getContext("2d");
  let L, s = size;
  for (; s > 10; s -= 4) {
    L = layout(probe, text || " ", `${weight} ${s}px "${font}"`, s, stickers);
    if (L.bottom - L.top <= avail) break;
  }
  const pad = Math.max(24, Math.round(s * 0.15));
  const len = Math.ceil(L.width) + pad * 2;

  const flat = canvas(len, WIDTH);
  const f = flat.getContext("2d");
  f.fillStyle = "#fff"; f.fillRect(0, 0, len, WIDTH);
  f.fillStyle = "#000"; f.strokeStyle = "#000";
  if (border) { f.lineWidth = 8; f.strokeRect(8, 8, len - 16, WIDTH - 16); }
  drawLine(f, L, pad, (WIDTH - (L.bottom - L.top)) / 2 - L.top);

  // rotate 90° counter-clockwise: the text reads bottom to top along the strip
  const out = canvas(WIDTH, len);
  const o = out.getContext("2d");
  o.translate(0, len);
  o.rotate(-Math.PI / 2);
  o.drawImage(flat, 0, 0);
  return { ...toBits(out), shrunk: s < size ? 1 : 0 };
}

// Greedy word wrap: break a line at spaces so each piece fits maxW at the given font.
function wrapLine(ctx, line, font, s, stickers, maxW) {
  const words = line.split(" ");
  const out = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && layout(ctx, next, font, s, stickers).width > maxW) {
      out.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  out.push(cur);
  return out;
}

// Horizontal lines across the paper at the chosen size. With wrap, long lines
// break at spaces; a line (or single word) still too wide is shrunk on its own.
export function label(text, { font = "Archivo Black", weight = 400, size = 64, align = "center", border = false, wrap = true, stickers } = {}) {
  const ctx = canvas(1, 1).getContext("2d");
  const margin = border ? 24 : 12;
  const spec = `${weight} ${size}px "${font}"`;
  const rows = (text || " ")
    .split("\n")
    .flatMap((l) => (wrap ? wrapLine(ctx, l, spec, size, stickers, WIDTH - margin * 2) : [l]));
  const lines = rows.map((l) => {
    let L, s = size;
    for (; s > 10; s -= 2) {
      L = layout(ctx, l, `${weight} ${s}px "${font}"`, s, stickers);
      if (L.width <= WIDTH - margin * 2) break;
    }
    return { L, lh: Math.round(s * 1.2) };
  });
  const h = lines.reduce((sum, l) => sum + l.lh, 0) + margin * 2;
  const cv = canvas(WIDTH, h);
  const c = cv.getContext("2d");
  c.fillStyle = "#fff"; c.fillRect(0, 0, WIDTH, h);
  c.fillStyle = "#000";
  let y = margin;
  for (const { L, lh } of lines) {
    const x = align === "left" ? margin : align === "right" ? WIDTH - margin - L.width : (WIDTH - L.width) / 2;
    drawLine(c, L, x, y + lh / 2 + L.s * 0.35);
    y += lh;
  }
  if (border) { c.lineWidth = 6; c.strokeRect(6, 6, WIDTH - 12, h - 12); }
  return { ...toBits(cv), shrunk: lines.filter((l) => l.L.s < size).length };
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
