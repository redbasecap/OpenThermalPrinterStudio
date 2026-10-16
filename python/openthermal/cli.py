"""otps - print banners, labels and images on LX-D02 family thermal printers."""
from __future__ import annotations

import argparse
import asyncio
import sys

from PIL import Image

from . import protocol as P
from . import render


def build_image(args) -> Image.Image:
    if args.cmd == "banner":
        return render.banner(args.text, size=args.size, border=not args.no_border, font=args.font)
    if args.cmd == "label":
        return render.label(args.text.replace("\\n", "\n"), size=args.size, font=args.font)
    return Image.open(args.path)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="otps", description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("banner", help="long text along the paper strip")
    b.add_argument("text")
    b.add_argument("--no-border", action="store_true")
    b.add_argument("--size", type=int, default=260, help="font size in dots (shrunk if too tall)")
    lb = sub.add_parser("label", help="horizontal text, use \\n for line breaks")
    lb.add_argument("text")
    lb.add_argument("--size", type=int, default=64)
    im = sub.add_parser("image", help="print a picture")
    im.add_argument("path")
    im.add_argument("--dither", action="store_true", help="Floyd-Steinberg for photos")
    for p in (b, lb, im):
        p.add_argument("--font", help="path to a .ttf/.otf font")
        p.add_argument("--density", type=int, default=3, help="print darkness 1..7")
        p.add_argument("--name", default="LX", help="BLE name prefix")
        p.add_argument("--preview", metavar="PNG", help="save 1-bit preview and do not print")
    args = ap.parse_args(argv)

    img = build_image(args)
    rows = render.to_rows(img, dither=getattr(args, "dither", False))
    if args.preview:
        out = Image.new("1", (P.WIDTH, len(rows)), 1)
        out.putdata([0 if px else 1 for row in rows for px in row])
        out.save(args.preview)
        print(f"preview saved to {args.preview} ({len(rows)} lines)")
        return 0

    from .ble import print_packets  # bleak only needed for real prints
    try:
        asyncio.run(print_packets(P.pack_rows(rows), density=args.density, name_prefix=args.name))
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
