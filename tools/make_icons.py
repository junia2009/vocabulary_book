#!/usr/bin/env python3
"""Generate PWA icons (PNG) using only the Python standard library.

Draws a simple "flashcard" mark: a rounded square background with a
lighter card and a folded corner. No external dependencies required.
"""
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")

# Brand colours (R, G, B) — 静かで洗練されたパレット
BG_TOP = (12, 14, 19)       # near-black
BG_BOTTOM = (16, 19, 26)
CARD = (236, 233, 225)      # warm parchment
CARD_LINE = (175, 178, 184)
ACCENT = (121, 166, 203)    # 抑えたセイバー・ブルー


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded(x, y, w, h, left, top, right, bottom, radius):
    """Return True if pixel (x, y) is inside the rounded rect."""
    if x < left or x >= right or y < top or y >= bottom:
        return False
    # corners
    corners = [
        (left + radius, top + radius),
        (right - radius, top + radius),
        (left + radius, bottom - radius),
        (right - radius, bottom - radius),
    ]
    inside_core = (left + radius <= x < right - radius) or (top + radius <= y < bottom - radius)
    if inside_core:
        return True
    for cx, cy in corners:
        if (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2:
            return True
    return False


def build_pixels(size):
    rows = []
    r = max(1, size // 6)            # background corner radius
    margin = size // 6               # card margin
    cr = max(1, size // 14)          # card corner radius
    for y in range(size):
        row = bytearray()
        for x in range(size):
            # default: transparent
            px = (0, 0, 0, 0)
            # background rounded square
            if rounded(x, y, size, size, 0, 0, size, size, r):
                t = y / (size - 1)
                bg = lerp(BG_TOP, BG_BOTTOM, t)
                px = (bg[0], bg[1], bg[2], 255)
            # card area
            cl, ct, crr, cb = margin, margin, size - margin, size - margin
            if rounded(x, y, size, size, cl, ct, crr, cb, cr):
                px = (CARD[0], CARD[1], CARD[2], 255)
                # 抑えたアクセントの縦線（セイバー）
                acc_x0 = cl + (crr - cl) // 8
                acc_w = max(2, size // 40)
                if acc_x0 <= x < acc_x0 + acc_w and ct + (cb - ct) // 5 <= y < cb - (cb - ct) // 5:
                    px = (ACCENT[0], ACCENT[1], ACCENT[2], 255)
                else:
                    # 静かな2本の罫線
                    line_h = max(1, size // 32)
                    gap = (cb - ct) // 3
                    for i in range(1, 3):
                        ly = ct + gap * i
                        lx0 = acc_x0 + acc_w + (crr - cl) // 10
                        lx1 = crr - (crr - cl) // 6
                        if i == 2:
                            lx1 = lx0 + (crr - lx0) * 3 // 5
                        if ly <= y < ly + line_h and lx0 <= x < lx1:
                            px = (CARD_LINE[0], CARD_LINE[1], CARD_LINE[2], 255)
            row += bytes(px)
        rows.append(bytes(row))
    return rows


def write_png(path, size):
    rows = build_pixels(size)
    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter type 0
        raw += row
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        return c

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    print("wrote", path, f"({len(png)} bytes)")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (192, 512):
        write_png(os.path.join(OUT_DIR, f"icon-{size}.png"), size)
    write_png(os.path.join(OUT_DIR, "apple-touch-icon.png"), 180)
    write_png(os.path.join(OUT_DIR, "favicon-32.png"), 32)


if __name__ == "__main__":
    main()
