"""Turn text and images into 384-dot 1-bit rows (requires Pillow)."""
from __future__ import annotations

from PIL import Image, ImageDraw, ImageFont

from .protocol import WIDTH

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


def _font(size: int, path: str | None = None) -> ImageFont.FreeTypeFont:
    for p in [path] + FONT_CANDIDATES if path else FONT_CANDIDATES:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def banner(text: str, border: bool = True, font: str | None = None) -> Image.Image:
    """Text running along the paper strip, as tall as the paper is wide."""
    f = _font(260, font)
    l, t, r, b = f.getbbox(text)
    pad = 40
    img = Image.new("L", (r - l + 2 * pad, WIDTH), 255)
    d = ImageDraw.Draw(img)
    if border:
        d.rectangle([4, 4, img.width - 5, WIDTH - 5], outline=0, width=8)
    d.text(((img.width - (r - l)) // 2 - l, (WIDTH - (b - t)) // 2 - t), text, font=f, fill=0)
    return img.rotate(90, expand=True)


def label(text: str, size: int = 64, font: str | None = None) -> Image.Image:
    """Horizontal text lines across the paper width, auto-shrunk to fit."""
    lines = text.splitlines() or [""]
    while size > 8:
        f = _font(size, font)
        if max(f.getlength(s) for s in lines) <= WIDTH - 16:
            break
        size -= 2
    asc, desc = f.getmetrics()
    lh = asc + desc + 4
    img = Image.new("L", (WIDTH, lh * len(lines) + 16), 255)
    d = ImageDraw.Draw(img)
    for i, s in enumerate(lines):
        d.text(((WIDTH - f.getlength(s)) / 2, 8 + i * lh), s, font=f, fill=0)
    return img


def to_rows(img: Image.Image, dither: bool = False, threshold: int = 128) -> list[list[bool]]:
    """Scale to WIDTH and convert to rows of booleans (True = black)."""
    img = img.convert("L")
    if img.width != WIDTH:
        img = img.resize((WIDTH, max(1, round(img.height * WIDTH / img.width))))
    if dither:
        img = img.convert("1")  # Floyd-Steinberg
        px = img.load()
        return [[px[x, y] == 0 for x in range(WIDTH)] for y in range(img.height)]
    px = img.load()
    return [[px[x, y] < threshold for x in range(WIDTH)] for y in range(img.height)]
