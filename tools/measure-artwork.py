#!/usr/bin/env python3
"""
Measures knob geometry off a scan of the manual's panel artwork.

The panel graphics are pure black and white, which makes the geometry
recoverable rather than guessable: find the solid white knob caps, then sweep a
radius and record the angles where the printed tick marks sit.

Usage:
    python3 tools/measure-artwork.py reference/panel-osc2-knobs.png

Requires: pillow, numpy  (pip install pillow numpy)
"""

import sys
import numpy as np
from PIL import Image


def load(path):
    img = np.array(Image.open(path).convert("L"))
    return img > 128


def find_caps(white, min_radius=14, stride=3):
    """Knob caps are the only large solid-white disks, so look for points whose
    whole neighbourhood is white."""
    integral = white.astype(np.int64).cumsum(0).cumsum(1)

    def boxsum(y, x, r):
        return (integral[y + r, x + r] - integral[y - r - 1, x + r]
                - integral[y + r, x - r - 1] + integral[y - r - 1, x - r - 1])

    h, w = white.shape
    r = min_radius
    hits = []
    for y in range(r + 1, h - r - 1, stride):
        for x in range(r + 1, w - r - 1, stride):
            if boxsum(y, x, r) == (2 * r + 1) ** 2:
                hits.append((x, y))
    if not hits:
        return []

    hits = np.array(sorted(hits))
    groups, cur = [], [hits[0]]
    for p in hits[1:]:
        if p[0] - cur[-1][0] > 60:
            groups.append(np.array(cur))
            cur = [p]
        else:
            cur.append(p)
    groups.append(np.array(cur))
    return [(g[:, 0].mean(), g[:, 1].mean(), len(g)) for g in groups]


def radial_profile(white, cx, cy, rmax=140):
    """White coverage at each radius. Peaks mark the cap edge, the knob outline,
    the tick ring and the numeral ring."""
    h, w = white.shape
    angles = np.arange(0, 360, 1.0) * np.pi / 180
    out = []
    for r in range(10, rmax, 2):
        xs = np.round(cx + np.sin(angles) * r).astype(int)
        ys = np.round(cy - np.cos(angles) * r).astype(int)
        m = (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
        out.append((r, white[ys[m], xs[m]].mean()))
    return out


def tick_angles(white, cx, cy, radius, gap=2.0):
    """Angles (degrees, 0 = straight up, clockwise positive) where the tick ring
    is white."""
    h, w = white.shape
    on = []
    for deg in np.arange(-180, 180, 0.25):
        a = np.radians(deg)
        x = int(round(cx + np.sin(a) * radius))
        y = int(round(cy - np.cos(a) * radius))
        if 0 <= x < w and 0 <= y < h and white[y, x]:
            on.append(deg)
    if not on:
        return []
    groups, cur = [], [on[0]]
    for p in on[1:]:
        if p - cur[-1] > gap:
            groups.append(cur)
            cur = [p]
        else:
            cur.append(p)
    groups.append(cur)
    return [round(float(np.mean(g)), 1) for g in groups]


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    white = load(sys.argv[1])
    caps = find_caps(white)
    print(f"{len(caps)} knob cap(s) found\n")

    for cx, cy, n in caps:
        print(f"cap at x={cx:.0f} y={cy:.0f}  (area {n})")
        prof = radial_profile(white, cx, cy)
        peaks = [(r, f) for r, f in prof if f > 0.15]
        print("  rings at radius:", ", ".join(f"{r}({f:.2f})" for r, f in peaks) or "none")
        for r, f in peaks:
            angles = tick_angles(white, cx, cy, r)
            if 4 <= len(angles) <= 24:
                print(f"  r={r}: {len(angles)} ticks -> {angles}")
        print()


if __name__ == "__main__":
    main()
