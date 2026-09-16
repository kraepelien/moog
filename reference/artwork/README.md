# Source artwork

The hand-drawn exports the panel is built from. Nothing imports these files: the
paths were transcribed into TypeScript so they could be split into the parts that
turn and the parts that stay still, and so a label could be drawn from a control
definition rather than baked into the drawing.

They are kept because they are the authority. The code says "lifted verbatim"
in several places, and without these that claim cannot be checked — and if a path
ever needs re-deriving, the drawing is the source, not the copy of it in a `.ts`
file.

| File | What was taken from it | Where it lives now |
|---|---|---|
| `OSC. 1 (1).svg` | rotary selector body, tick spokes, six waveform marks | `knob/artwork.ts`, `knob/waveforms.ts` |
| `OSC. 1 (2).svg` | nothing — read to understand the octave variant, whose labels are live text | — |
| `OSC. 3.svg` | the reverse sawtooth mark, which Oscillator-1 has and the others do not | `knob/waveforms.ts` |
| `KNOB 5.svg` | the continuous knob body, its cap and its indicator dot | `knob/dialArtwork.ts` |
| `TUNE.svg` | nothing now — it drew the small continuous knob before `KNOB 5.svg` replaced both | — |
| `MODULATION MIX.svg` | nothing now — it drew the large one, and a bigger knob is a render scale rather than a second path | — |
| `BUTTON.svg` | switch body, rocker and tab, with the rocker at the right | `switch/ToggleSwitch.tsx` |
| `BUTTON (1).svg` | nothing — it is `BUTTON.svg` mirrored, and the component reflects rather than carrying a second copy | — |
| `WHEEL.svg` | frame, face, the eighteen ribs and the marker | `wheel/wheelArtwork.ts` |

Two things worth knowing before changing any of them:

- **One drawing serves every continuous knob.** A bigger knob is a render scale,
  not a second path. `KNOB 5.svg` is drawn in its own 100-unit box, and the code
  fits it onto the 116-unit dial with a group transform rather than re-pathing it.
- **Its cap holds a `0`.** That is the digit it was drawn with, not artwork: the
  dial prints the live value as text, so the glyph is left out.
- **Each export is drawn turned to some angle**, recorded in the code as
  `bakedAngle`, and rendering rotates by the difference. Re-export at a different
  angle and that number has to change with it.

Measured geometry recovered from the printed manual — detent spacing, tick
angles, the palette — is in `../measurements.md`.
