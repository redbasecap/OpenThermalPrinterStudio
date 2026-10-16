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


def banner(text: str, size: int = 260, border: bool = True, font: str | None = None) -> Image.Image:
    """Text running along the paper strip; several lines sit side by side across
    the paper and are shrunk together if they are too tall for it."""
    avail = WIDTH - (48 if border else 16)
    rows = text.splitlines() or [""]
    while True:
        f = _font(size, font)
        boxes = [f.getbbox(r or " ") for r in rows]
        gap = round(size * 0.18)
        total = sum(b - t for _, t, _, b in boxes) + gap * (len(rows) - 1)
        if total <= avail or size <= 10:
            break
        size -= 4
    pad = max(24, round(size * 0.15))
    text_w = max(r - l for l, _, r, _ in boxes)
    img = Image.new("L", (text_w + 2 * pad, WIDTH), 255)
    d = ImageDraw.Draw(img)
    if border:
        d.rectangle([4, 4, img.width - 5, WIDTH - 5], outline=0, width=8)
    y = (WIDTH - total) // 2
    for row, (l, t, r, b) in zip(rows, boxes):
        d.text((pad + (text_w - (r - l)) // 2 - l, y - t), row, font=f, fill=0)
        y += b - t + gap
    return img.rotate(90, expand=True)


def _wrap(line: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    out, cur = [], ""
    for w in line.split(" "):
        nxt = f"{cur} {w}" if cur else w
        if cur and f.getlength(nxt) > max_w:
            out.append(cur)
            cur = w
        else:
            cur = nxt
    return out + [cur]


def label(text: str, size: int = 64, font: str | None = None, wrap: bool = True) -> Image.Image:
    """Horizontal text lines at the given size. With wrap, long lines break at
    spaces; a line or single word still too wide is shrunk on its own."""
    rows = text.splitlines() or [""]
    if wrap:
        f0 = _font(size, font)
        rows = [part for line in rows for part in _wrap(line, f0, WIDTH - 24)]
    fitted = []
    for line in rows:
        s = size
        while s > 10 and _font(s, font).getlength(line) > WIDTH - 24:
            s -= 2
        f = _font(s, font)
        asc, desc = f.getmetrics()
        fitted.append((line, f, asc + desc + 4))
    img = Image.new("L", (WIDTH, sum(lh for *_, lh in fitted) + 24), 255)
    d = ImageDraw.Draw(img)
    y = 12
    for line, f, lh in fitted:
        d.text(((WIDTH - f.getlength(line)) / 2, y), line, font=f, fill=0)
        y += lh
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
