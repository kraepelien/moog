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
bun test         # unit, component and server tests, one file at a time (~10s)
bun run test     # the same suite across 4 worker processes (~4s)
bun run lint     # oxlint
bun run serve    # the built app plus the file-backed API on 5174 (PORT to change it)
```

Build, test and lint all pass before a change is done. `bun run build` is the only thing that
typechecks `src/`: tests sit outside `tsconfig.app.json`'s `include` and run type-stripped.

Two dev servers cannot share a port, so quote the port with any URL or screenshot; otherwise which
worktree it came from is a guess.

## Pull requests

`CHANGELOG.md` lists every pull request merged into `main`, newest first, one line each:

```markdown
- [Home on the mark, and a tag's picker on the colour it is wearing](https://github.com/kraepelien/moog/pull/76)
```

A commit pushed straight to `main` may take a line too, without the link — there is no pull request
to point at, and a line that named one would be pointing at somebody else's.

```markdown
- Add the two that merged after the list was written
```

Nothing else goes in it: no versions, no dates, no grouping. The order it landed in is the history.

The branch writes its own line as it goes, without the link: a pull request has no number to point
at until it is opened, and a line naming one would be pointing at somebody else's. After the merge,
on a `main` that already has the change, the line is rewritten with the link.

Two branches both adding a line collide on the same first line of the list. Both are wanted, so the
conflict is settled by keeping both, in the order they landed. The rewrite never goes to the branch:
a commit pushed to a branch whose pull request has already merged is stranded.

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
- **Ids reaching the filesystem are pattern-checked** in `server/repositories/patches.ts` before
  they become filenames. The pattern, not the path join, is what keeps an id of `../../etc/passwd`
  in its folder.
- **Adding a privilege is free; renaming one is not.** Adding is `src/access/privileges.ts` plus the
  route that asks for it, and never a migration. But `user_privileges` stores privilege *names* and
  `users.roles` stores role names, so both are published interfaces like a control id, recorded in
  `test/privilege-names.lock.json` — hand-written, add-only. A rename fails in the dangerous
  direction: an orphaned revoke stops applying while the gate lives on under the new name, quietly
  handing access back. When that lock fails, restore the old name rather than edit the lock.
- **One privilege is written at a time, never the set.** A whole-set write deletes override rows
  naming privileges the writing build does not know, and a silently deleted revoke is somebody
  getting access back. `resolve()` in `src/access/privileges.ts` is the only place the order
  role → grant → revoke → prerequisite exists; the reasons a particular revoke may not be
  *written* live in `server/services/users.ts`, so the resolution order stays a rule without
  exceptions.
- **A new `Admin*` privilege needs an entry in `REQUIRES`.** Everything administrative is
  conditional on `AccessAdmin`, applied last so no grant steps over it, which is what makes
  revoking it de-administer somebody everywhere rather than only hiding pages. Declared beside the
  privileges rather than as a second `needs` on each route, because a route that forgot the second
  entry is the hole it closes — and routes are not the only place a privilege is asked about.
  `test/privileges.test.ts` fails if an `Admin*` name has no prerequisite.
- **A route declares what it needs**, in `server/routes/table.ts`'s entries. The guard runs there
  for every route at once, so a handler never checks for itself — and a route that forgot to ask
  cannot exist. The client's `<Can>` and `<RouteGuard>` choose what to draw and are never the check.
- **SQL lives in a repository, rules live in a service.** A repository that also refused would be a
  second place for the rules to live. A route with no rules of its own talks to its repository
  rather than to a service that would only forward the call.
- **The bank in `bank/` seeds and never overwrites.** A row the database already holds is the live
  bank, and an administrator editing it is the only thing that changes a factory patch, so a change
  to a file reaches a fresh database and nothing else. Do not add a flag, route or environment
  variable that writes files back over rows: every one of them is a way to discard corrections
  somebody made on purpose. `BANK_REFRESH` in `server/factory.ts` was the one exception and is
  spent, and `test/factoryBank.test.ts` fails if the number moves.

- **There is one schema step and it is the whole schema.** Nothing is deployed, so a change edits
  that step and the database is recreated: a new column goes into the table it belongs to, and
  something that turned out to be a mistake comes back out of the table that had it. Do not add a
  second step and do not bump `DB_VERSION` — a migration buys nothing while no database anywhere
  holds data that has to survive, and every one of them is a shape the code has to keep meeting for
  ever. `SCHEMA` and `meta.db_version` stay as an array and a number so the day a step becomes
  append-only needs no rewiring.

  The cost is paid by whoever is already running one: a database made before the edit keeps whatever
  the old step gave it, because its version is unchanged and nothing re-runs. Deleting
  `data/moog.db*` is how it catches up, and on the NAS that means a redeploy with the volume
  cleared. Say so in the pull request every time.

  This changes the day something real is running against a database somebody cares about. From then
  on a step is append-only, a new one is the only honest move, and a test making an old database to
  migrate comes back with it.

## The sound is derived, and says so

`src/audio/calibration.ts` is the only place a dial reading becomes hertz, seconds or a gain. Every
entry carries its source, and `test/calibration.test.ts` fails if one claims to come from the
hardware without citing a path under `reference/`. Tune by ear there and nowhere else.

Two invariants in `src/audio/engine.ts` that are easy to break and hard to hear: `apply()` never
calls `cancelScheduledValues` on anything, because that is how a knob turned mid-note destroys a
running contour; and nothing is created per note, because an oscillator cannot be restarted once
stopped. Both are pinned by tests that assert an absence, so read them before rearranging the graph.

What cannot be modelled is listed in `SILENT` in `src/audio/settings.ts` with its reason, shown in
the checklist, and proved silent by moving each control through its whole travel. Add to that list
rather than leaving a control quietly doing nothing.

## Imports

Anything crossing out of its own directory goes through an alias — `@patch/schema.ts`,
`@controls/registry.ts`, `@server/store.ts`, and `@/tones.ts` for the few files sitting directly in
`src/`. Siblings stay relative (`./types.ts`). The map is `tsconfig.paths.json`, and it is the only
copy: the three tsconfigs extend it, `vite.config.ts` reads it, and `test/image.test.ts` walks it.
Add a top-level directory and you add one line there, nowhere else.

**Every specifier carries its `.ts`.** Not a style choice: `server/` and `vite.config.ts` compile
under `tsconfig.node.json` with `"module": "nodenext"`, which requires an explicit extension and
rejects `./store` with TS2835 — for aliased specifiers too, so `@server/store` fails the same way.
`src/` is `moduleResolution: bundler` and would accept either, and one rule that holds everywhere
beats two.

Three resolvers have to agree on the map, and only two of them fail loudly:

- **Bun reads `paths` from the root `tsconfig.json` only.** It does not follow project references,
  which is why the map is in a file all three configs extend rather than in `tsconfig.app.json`.
  This is also why the runtime image copies both tsconfigs: the server is not bundled, so Bun maps
  `@patch/schema.ts` as it boots, and without them it is an unresolved bare specifier and a
  crashloop. Pinned by `test/image.test.ts`.
- **Vite's config loader does not apply `resolve.alias`.** `vite.config.ts` imports
  `server/vitePlugin.ts`, so the whole server graph is loaded as config, and under the default
  bundling loader every aliased import in `server/` resolved to nothing — 14 `UNRESOLVED_IMPORT`
  warnings, externalised, and working only because Bun happened to resolve them afterwards. Hence
  `--configLoader native` on every `vite` invocation in `package.json`: Bun loads the config
  directly and applies `paths` itself. Drop the flag and the warnings come back.

## Gotchas that have already cost time

- **SVG gradient and filter ids are document-global.** Shared `<defs>` once, not per knob.
- **A knob is roughly 40 SVG nodes.** Keep the memo and keep its props primitive, or dragging one
  knob repaints every other.
- **`localStorage` does not exist in Bun's runtime.** The storage adapter takes its `Storage` object
  as a parameter; keep it injected rather than reaching for `window`.
- **Bun loads `.env`, and the server reads its configuration from the environment.** Before
  `test/setup.ts` emptied every `MOOG_*` variable, a developer who had set up sign-in ran the suite
  against a different application than CI did: oauth rather than off, and 45 tests failing on a 401
  that nobody else could reproduce. A test that needs configuration states it rather than inheriting
  it.
- **happy-dom has no Web Audio.** `test/fakeAudio.ts` is a context that records instead of
  sounding, which is why the engine only ever uses the factory methods (`context.createGain()`)
  rather than the constructor forms: one surface to keep faked.
- **A MUI transition costs real wall-clock time in a test.** `waitForElementToBeRemoved` on a
  dialog sits through the quarter-second close fade, and `test/playMidi.test.tsx` alone spent four
  of the suite's fifteen seconds that way. Rendering under
  `createTheme({ motion: { reducedMotion: 'always' } })` collapses every transition to one frame
  without disabling it, so the tests still drive the dialog they always did.
- **`fireEvent` cannot target `window` under happy-dom.** Dispatch on `document.body`; it bubbles.
- **happy-dom has no pointer capture.** `test/setup.ts` installs no-ops, without which any
  `pointerdown` on a knob throws before a drag can be exercised.
- **Floating point does not accumulate.** Continuous values are re-rounded to the control's `step`
  on every change, because adding 0.01 a hundred times does not give 1.
- **The server ships unbundled, so the image has to contain everything it imports.** `CMD` runs Bun
  against `server/serve.ts` and the imports resolve as it boots, several of them crossing into
  `src/` for the patch schema, the instruments and the tag rules. Leaving one out is a crashloop, not
  a build error. `test/image.test.ts` walks that graph against the Dockerfile's runtime stage, and
  the deploy workflow starts the built image and calls `/api/health` before pushing it.
- **SVG text does not inherit `font-family`** the way HTML does; `svg { font-family: inherit }` is
  what carries the face into dials and switch legends.

## Tests

`test/` holds the suite and ships nothing. `test/fixtures.ts` defines two deliberately fake control
types, there to prove the registry, resolver and importer stay generic over control types; neither
is a proposal for a real Minimoog control.

Prefer driving the panel the way a person does over calling into it. The component tests render and
interact; that is what catches a control that draws correctly and responds to nothing.
