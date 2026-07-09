#!/usr/bin/env python3
"""Generate build/icon.png (1024px master) and build/icon.iconset for Shipdeck.

Draws a macOS-style squircle (824px on the 1024 grid, like native app icons)
with a navy gradient, faint waves, and an anchor glyph. Run from the repo root:

    python3 build/make-icon.py && iconutil -c icns build/icon.iconset -o build/icon.icns
"""
from PIL import Image, ImageDraw
import os

S = 4  # supersampling factor
N = 1024 * S
OUT = os.path.dirname(os.path.abspath(__file__))

INSET, RADIUS = 100 * S, 185 * S            # Apple's 824px rounded rect
TOP, BOTTOM = (24, 74, 124), (10, 27, 46)   # navy gradient
GLYPH = (237, 244, 251, 255)
DY = -30 * S                                # optical vertical centering of the glyph


def rounded_mask() -> Image.Image:
    m = Image.new('L', (N, N), 0)
    ImageDraw.Draw(m).rounded_rectangle([INSET, INSET, N - INSET, N - INSET], radius=RADIUS, fill=255)
    return m


def gradient() -> Image.Image:
    g = Image.new('RGB', (1, N))
    px = g.load()
    for y in range(N):
        t = y / (N - 1)
        px[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM))
    return g.resize((N, N))


def line_with_caps(d: ImageDraw.ImageDraw, p1, p2, w: int, fill) -> None:
    d.line([p1, p2], fill=fill, width=w)
    for x, y in (p1, p2):
        d.ellipse([x - w // 2, y - w // 2, x + w // 2, y + w // 2], fill=fill)


def main() -> None:
    mask = rounded_mask()
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    img.paste(gradient(), (0, 0), mask)

    overlay = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)

    # top sheen
    sheen = Image.new('L', (1, N), 0)
    spx = sheen.load()
    for y in range(N // 2):
        spx[0, y] = round(26 * (1 - y / (N / 2)))
    d.bitmap((0, 0), Image.new('L', (N, N), 0))  # no-op keeps draw bound to overlay
    overlay.paste((255, 255, 255), (0, 0), sheen.resize((N, N)))

    # waves
    import math
    for base_y, alpha in ((768 * S, 34), (840 * S, 22)):
        pts = [(x, base_y + round(16 * S * math.sin((x / (150 * S)) * math.pi))) for x in range(0, N + 1, 8 * S)]
        d.line(pts, fill=(255, 255, 255, alpha), width=10 * S, joint='curve')

    # anchor glyph
    w = 46 * S

    def Y(v: int) -> int:
        return v * S + DY

    ring_r = 62 * S
    cx = 512 * S
    d.ellipse([cx - ring_r, Y(300) - ring_r, cx + ring_r, Y(300) + ring_r], outline=GLYPH, width=w)
    line_with_caps(d, (cx, Y(362)), (cx, Y(838)), w, GLYPH)
    line_with_caps(d, (352 * S, Y(470)), (672 * S, Y(470)), w, GLYPH)
    arm_r = 220 * S
    bbox = [cx - arm_r - w // 2, Y(618) - arm_r - w // 2, cx + arm_r + w // 2, Y(618) + arm_r + w // 2]
    d.arc(bbox, start=0, end=180, fill=GLYPH, width=w)
    for tip in (292, 732):
        d.polygon([(tip * S - 50 * S, Y(638)), (tip * S + 50 * S, Y(638)), (tip * S, Y(538))], fill=GLYPH)

    img = Image.alpha_composite(img, Image.composite(overlay, Image.new('RGBA', (N, N), (0, 0, 0, 0)), mask))
    master = img.resize((1024, 1024), Image.LANCZOS)
    master.save(os.path.join(OUT, 'icon.png'))

    iconset = os.path.join(OUT, 'icon.iconset')
    os.makedirs(iconset, exist_ok=True)
    for size in (16, 32, 128, 256, 512):
        master.resize((size, size), Image.LANCZOS).save(os.path.join(iconset, f'icon_{size}x{size}.png'))
        master.resize((size * 2, size * 2), Image.LANCZOS).save(os.path.join(iconset, f'icon_{size}x{size}@2x.png'))
    print('wrote icon.png and icon.iconset/')


if __name__ == '__main__':
    main()
