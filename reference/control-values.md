# Control values reported from the hardware

Received second-hand, not yet measured or confirmed against an instrument, and
**not** what the code uses — every control is still a placeholder with no range.
Recorded here so it survives until each control is specified properly.

The recurring theme: **the printed scale is not the range.** Several controls
travel further than the silkscreen admits, because only some numerals are
printed. Anything that reads a printed scale as a range will be wrong.

| Control | Printed on the panel | Actual range |
|---|---|---|
| Tune | `1`, `2` | −2.5 … +2.5 |
| Osc-2 Frequency | `1`, `3`, `5`, `7` | −8 … +8 |
| Osc-3 Frequency | `1`, `3`, `5`, `7` | −8 … +8 |
| Cutoff Frequency | `2`, `4` | −5 … +5 |

The ±8 figure independently matches `measurements.md`, which recovered a printed
scale running to ±7 and noted the control's real range is ±8 — the reason the
build there compressed the sweep to 21.25° per unit.

## Attack Time and Decay Time

Not relative and not linear. The knob reads `0 … 10`, but position maps to a time
through a set of tick marks whose spacing is even while their values are not:

| Knob position | Time |
|---|---|
| 0.000 | 0 ms |
| 0.833 | 10 ms |
| 1.667 | 100 ms |
| 2.500 | 200 ms |
| 3.333 | 400 ms |
| 4.167 | 600 ms |
| 5.000 | 800 ms |
| 5.833 | 1 s |
| 6.667 | 3 s |
| 7.500 | 5 s |
| 8.333 | 7.5 s |
| 9.167 | 10 s |
| 10.000 | 30 s |

Thirteen anchors spread evenly across the knob's travel. That spacing is a
derivation, not a measurement — but it lands 800 ms at exactly the halfway
point, which is how the values were described, so the two agree.

Reported as approximate, and Attack and Decay appear to differ slightly from
each other despite carrying identical markings. Treat the table as one curve
until there is a reason to split it, and expect two tables eventually.

## Not controls

- **Overload** (Mixer) — indicator only, nothing to set. Removed from the registry.
- **Phones jack** (Output) — a socket.
- **Pilot lamp** (Power) — indicator.

## Not needed for recalling a sound

Output and Power carry no part of a patch: master volume, headphone volume, main
output, A-440 and power say nothing about how a sound is made. They can stay on
the panel as drawing without holding values. Performance — LFO Rate, the Glide
and Decay switches, and the two wheels — **is** worth keeping.
