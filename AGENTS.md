# AGENTS.md

`README.md` says what this project is and why it is built the way it is. Read it first. This file
is how to work in it without breaking things.

## Code Comments

- A comment gives the **reason** code is the way it is: a constraint, a trade-off, a rejected
  alternative, an upstream quirk. Delete anything describing *what* the code does: restatements of
  the signature, type, or next line; terms already in the identifier; narration of visible steps.
- One to three lines, stated once, where the decision lives. Same rule in tests: assertions describe
  themselves, so comment only non-obvious setup or a regression's cause.

## Commands

Package manager is **Bun**. Never npm, npx, yarn or pnpm.

```bash
bun install
bun run dev      # Vite dev server on 5173, or the next free port if a worktree already holds it
bun run build    # tsc -b, then a production build into dist/
bun test         # unit, component and server tests
bun run lint     # oxlint
bun run serve    # the built app plus the file-backed API on 5174 (PORT to change it)
```

Build, test and lint all pass before a change is done. `bun run build` is the only thing that
typechecks `src/`: tests sit outside `tsconfig.app.json`'s `include` and run type-stripped.

Two dev servers cannot share a port, so quote the port with any URL or screenshot; otherwise which
worktree it came from is a guess.

## Names in a saved patch are a published interface

Control ids, position ids and control types are written into people's patches and exported files.
Renaming one fails nowhere: the old id becomes unknown and is preserved unrendered, the new one
takes its default, and the patch looks like it loaded while a setting is silently gone.

`test/patch-format.lock.json` records every name the format has ever used. It is hand-written and
only ever added to. When one of its tests fails, the fix is to restore the old name, not to edit the
lock.

The same reasoning governs stored values: continuous controls store real printed units and time
knobs store milliseconds, never a fraction of travel, so a later change of range clamps instead of
remapping every saved patch.

## Constraints

- **A control is data, not a component.** Adding a control to a section is one entry in
  `src/controls/panel.ts`. A new *kind* of control is a `ControlType` codec plus a component, and
  the codec owns its whole validation policy in one `decode`. Layout code changes for neither.
- **Anything a definition can contradict belongs in `validateDef`**, which runs when the registry is
  built, so a bad definition fails at startup rather than as a puzzling runtime value.
- **Never guess a newer `schemaVersion` forward.** Older data goes through the chain in
  `src/patch/migrate.ts`, keyed by the version it upgrades from; newer data is a hard failure.
- **The hand-drawn SVG exports are not ours to redraw.** Reuse the paths verbatim and change only
  grouping and colour references. Each export is baked at an angle it was drawn at, so rendering
  rotates by `angle - bakedAngle`; nothing is re-pathed.
- **Do not estimate geometry by eye.** `tools/measure-artwork.py` recovers it from the scans and
  `reference/measurements.md` holds what it found, including one deliberate deviation from the print.
- **Ids reaching the filesystem are pattern-checked** in `server/store.ts` before they become
  filenames. The pattern, not the path join, is what keeps an id of `../../etc/passwd` in its folder.

## Gotchas that have already cost time

- **SVG gradient and filter ids are document-global.** Shared `<defs>` once, not per knob.
- **A knob is roughly 40 SVG nodes.** Keep the memo and keep its props primitive, or dragging one
  knob repaints every other.
- **`localStorage` does not exist in Bun's runtime.** The storage adapter takes its `Storage` object
  as a parameter; keep it injected rather than reaching for `window`.
- **happy-dom has no pointer capture.** `test/setup.ts` installs no-ops, without which any
  `pointerdown` on a knob throws before a drag can be exercised.
- **Floating point does not accumulate.** Continuous values are re-rounded to the control's `step`
  on every change, because adding 0.01 a hundred times does not give 1.
- **SVG text does not inherit `font-family`** the way HTML does; `svg { font-family: inherit }` is
  what carries the face into dials and switch legends.

## Tests

`test/` holds the suite and ships nothing. `test/fixtures.ts` defines two deliberately fake control
types, there to prove the registry, resolver and importer stay generic over control types; neither
is a proposal for a real Minimoog control.

Prefer driving the panel the way a person does over calling into it. The component tests render and
interact; that is what catches a control that draws correctly and responds to nothing.
