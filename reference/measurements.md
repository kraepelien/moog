# Measurements taken from the manual artwork

Everything here was measured off the scans in this folder with
`tools/measure-artwork.py`, not estimated by eye. Re-run it if you add scans.

The panel graphics are pure black and white, which is what makes this possible:
the knob caps are the only large solid-white disks, so they can be located
automatically, and the printed tick marks can then be found by sweeping a
radius and recording where it crosses white.

Angles are in degrees, `0` = straight up, clockwise positive.

## Palette

Sampled from `panel-controllers-oscbank.png`. There are only six colours:

| Role | Hex |
|---|---|
| Panel | `#000000` |
| Line art, legends | `#FFFFFF` |
| Switch, live | `#E4824D` |
| Switch rocker, live | `#CBCDCE` |
| Switch, off | `#626366` |
| Switch rocker, off | `#39383A` |

No anti-aliasing beyond a thin edge — treat it as two-tone plus the orange
switch accent.

## Rotary selector switches (Range, Waveform)

Six detents, evenly spaced 30° apart:

```
-75°   -45°   -15°   +15°   +45°   +75°
```

Range reads `LO, 32', 16', 8', 4', 2'` across those positions. Waveform reads
triangle, triangle-saw, sawtooth, square, wide pulse, narrow pulse.

> **Correction.** The reading above holds for Oscillator-1 and Oscillator-2. On
> **Oscillator-3** the second waveform is a **reverse sawtooth** — the mirror of
> the rising ramp at the next detent — not the hybrid. The scan this was measured
> from does not distinguish the two oscillators, so the difference was missed.
> The build carries both glyphs and the angles above are unaffected.

In `panel-osc2-knobs.png` the Range knob is drawn pointing at `8'` (+15°) and
Waveform at the triangle (−75°).

## Oscillator frequency knob

Ticks at **every integer except zero** — the gap at the top is where the
indicator dot sits at centre position. Numerals printed on the odd values only
(−7, −5, −3, −1, 1, 3, 5, 7).

Measured tick angles at radius 82px:

```
-168.9  -140.3  -117.0  -89.2  -66.0  -37.6  -14.1
  14.1    37.0    64.6   89.6  117.2  139.9  168.6
```

That works out to roughly **24° per unit**, putting ±7 at about ±167°.

### The one deliberate deviation

The artwork's scale runs to ±7. The control's actual range is ±8, and at 24°
per unit ±8 would land past ±190°, where the two ends of the sweep collide at
the bottom of the knob.

The build therefore uses **21.25° per unit**, putting ±8 at ±170° with
clearance. Printed ticks and the pointer stay consistent with each other, but
the scale is very slightly compressed against the original.

If exact fidelity to the print matters more than the ±8 range, change the
sweep so ±7 sits at ±167° and clamp the value there instead.

## Knob proportions

Two visually different knob types, expressed as a fraction of the tick-ring
radius so they scale:

| | Small (Range, Waveform) | Large (Frequency) |
|---|---|---|
| White cap | 0.45 | 0.74 |
| Indicator | pointer line | dot at 0.85 |
| Skirt | fluted, wide | narrow fluted ring |

The small knobs use the hand-drawn export in `knob-export.svg` directly. The
large one is currently generated — see README, it's the next thing to draw
properly.

## A note on the tool's output

`measure-artwork.py` scans every radius that shows white, so some rings come
back contaminated by the numeral glyphs sitting near the ticks. The clean
readings above came from the rings where tick count and spacing are
self-consistent: **r=84** for the small knobs, **r=82** for the large one.
Treat the tool as exploratory and sanity-check the spacing before trusting a
row.
