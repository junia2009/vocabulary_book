#!/usr/bin/env python3
"""Generate PWA icons (PNG) using only the Python standard library.

Draws the app emblem — concentric rings pierced by a vertical "saber" line
with a glowing core — in a restrained accent blue over near-black. Rendered
with supersampling + signed-distance fields for smooth, refined edges and a
soft glow, matching the in-app theme.
"""
import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")

BG = (10, 12, 16)                 # near-black
ACCENT = (121, 166, 203)          # 抑えたセイバー・ブルー
ACCENT_BRIGHT = (158, 196, 226)   # 光の芯
SS = 3                            # supersampling factor


def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


def smoothstep(e0, e1, x):
    if e1 == e0:
        return 0.0 if x < e0 else 1.0
    t = clamp((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def ring(r, radius, hw, aa, glow, ga):
    d = abs(r - radius)
    core = 1.0 - smoothstep(hw, hw + aa, d)
    g = ga * math.exp(-(d / glow) * (d / glow))
    return core, g


def vline(dx, dy, hw, y0, y1, aa, glow, ga):
    if dy < y0:
        dd = math.hypot(dx, dy - y0)
    elif dy > y1:
        dd = math.hypot(dx, dy - y1)
    else:
        dd = abs(dx)
    core = 1.0 - smoothstep(hw, hw + aa, dd)
    g = ga * math.exp(-(dd / glow) * (dd / glow))
    return core, g


def rounded_inside(dx, dy, rr):
    # signed distance to rounded square of half-extent 0.5, corner radius rr
    qx = abs(dx) - (0.5 - rr)
    qy = abs(dy) - (0.5 - rr)
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - rr
    return outside <= 0.0


def shade(nx, ny, aa):
    """Return (r,g,b) emblem colour for a point in [0,1]^2 (no alpha)."""
    dx, dy = nx - 0.5, ny - 0.5
    r = math.hypot(dx, dy)

    # faint central haze behind the emblem
    haze = 0.10 * math.exp(-((r / 0.42) ** 2))
    base = (BG[0] + (ACCENT[0] - BG[0]) * haze,
            BG[1] + (ACCENT[1] - BG[1]) * haze,
            BG[2] + (ACCENT[2] - BG[2]) * haze)

    r1c, r1g = ring(r, 0.300, 0.0075, aa, 0.045, 0.55)
    r2c, r2g = ring(r, 0.180, 0.0055, aa, 0.035, 0.40)
    lc, lg = vline(dx, dy, 0.0105, -0.37, 0.37, aa, 0.05, 0.70)
    dc, dg = ring(r, 0.0, 0.030, aa, 0.05, 0.85)  # core dot (ring around r=0)
    # core dot as filled disc
    dc = max(dc, 1.0 - smoothstep(0.030, 0.030 + aa, r))

    core_i = clamp(max(r1c, r2c, lc, dc))
    glow_i = clamp(r1g + r2g + lg + dg)

    col = lerp(base, ACCENT_BRIGHT, core_i)
    col = (col[0] + ACCENT[0] * glow_i * 0.5,
           col[1] + ACCENT[1] * glow_i * 0.5,
           col[2] + ACCENT[2] * glow_i * 0.5)
    return (min(255, col[0]), min(255, col[1]), min(255, col[2]))


def build_pixels(size):
    rr = 0.235                       # corner radius (normalized)
    aa = 1.4 / (size * SS)           # edge softness
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            ar = ag = ab = aa_acc = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    nx = (x + (sx + 0.5) / SS) / size
                    ny = (y + (sy + 0.5) / SS) / size
                    if rounded_inside(nx - 0.5, ny - 0.5, rr):
                        cr, cg, cb = shade(nx, ny, aa)
                        ar += cr; ag += cg; ab += cb; aa_acc += 1.0
            n = SS * SS
            alpha = aa_acc / n
            if alpha > 0:
                inv = 1.0 / aa_acc
                row += bytes((int(ar * inv + 0.5), int(ag * inv + 0.5), int(ab * inv + 0.5), int(alpha * 255 + 0.5)))
            else:
                row += bytes((0, 0, 0, 0))
        rows.append(bytes(row))
    return rows


def write_png(path, size):
    rows = build_pixels(size)
    raw = bytearray()
    for row in rows:
        raw.append(0)
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
