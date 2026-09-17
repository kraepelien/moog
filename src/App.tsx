import { useCallback, useEffect, useRef, useState } from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { AdminPage } from './admin/AdminPage.tsx'
import type { TagInUse } from './admin/tags.ts'
import { FitToWidth } from './components/FitToWidth.tsx'
import { MidiHelp } from './components/MidiHelp.tsx'
import { TopBar, type TopBarAction } from './components/TopBar.tsx'
import surface from './components/controlSurface.module.css'
import { PatchLibrary } from './components/library/PatchLibrary.tsx'
import { NowPlaying } from './components/midi/NowPlaying.tsx'
import { PlayMidi } from './components/midi/PlayMidi.tsx'
import { PatchHeader } from './components/library/PatchHeader.tsx'
import {
  SavePatchDialog,
  type PatchFields,
  type SaveOutcome,
} from './components/library/SavePatchDialog.tsx'
import type { LibraryEntry } from './components/library/entry.ts'
import { Panel, PanelChecklist } from './components/Panel.tsx'
import { useConfirm } from './components/useConfirm.tsx'
import { SignIn } from './session/SignIn.tsx'
import { signOut, useSession } from './session/session.ts'
import { panelRegistry } from './controls/panel.ts'
import { isRecalled } from './controls/recall.ts'
import type { ControlValue } from './controls/types.ts'
import { mergeValues, resolvePatch, reportHasWarnings, type ResolveReport } from './patch/resolve.ts'
import { createPatch, type Patch } from './patch/schema.ts'
import { copyOf } from './presets/preset.ts'
import { createHttpStore } from './storage/httpStore.ts'
import { StoreError, type PatchSummary } from './storage/types.ts'
import { createBundle, parseBundle, serializeBundle } from './transfer/bundle.ts'
import { useView } from './navigation.ts'

const store = createHttpStore()

/* Thrown when a confirmation is declined. It unwinds the action the same way an
   error does, but says nothing: declining is not a failure. */
class Cancelled extends Error {}

function downloadJson(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/* Identity for "has this changed" — the parts a save would write, and nothing
   else. Comparing whole patches would count a re-stamped updatedAt as an edit. */
function signature(patch: Patch): string {
  return JSON.stringify([patch.name, patch.notes, patch.values])
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        {title}
      </Typography>
      {children}
    </Paper>
  )
}

export function App() {
  const [draft, setDraft] = useState<Patch | null>(null)
  const [saved, setSaved] = useState<readonly PatchSummary[]>([])
  const [presets, setPresets] = useState<readonly Patch[]>([])
  const [library, setLibrary] = useState<readonly LibraryEntry[]>([])
  /* The categories an admin keeps, which is what the save form offers — not the
     tags patches happen to wear, or a bank nothing is tagged in yet could never
     be given its first one. */
  const [tags, setTags] = useState<readonly string[]>([])
  /* The same list with its usage counts, which only an admin may ask for and
     only the admin page shows. */
  const [tagUse, setTagUse] = useState<readonly TagInUse[]>([])
  const [status, setStatus] = useState('')
  const [report, setReport] = useState<ResolveReport | null>(null)
  const [failed, setFailed] = useState(false)
  /* What the draft looked like when it was last saved or loaded. Comparing
     against it is what tells the user there is something unsaved. */
  const [clean, setClean] = useState('')
  /* Whether the server has this draft *and* will let me write it back. A patch
     of my own is written over; anything else — a factory preset, somebody
     else's — is created afresh, and only the server ever mints an id. */
  const [stored, setStored] = useState(false)
  /* What the draft was copied from, until it has been saved once. */
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null)
  /* Saving is a form rather than a button, so Save opens this and the write
     happens when the form is answered. */
  const [saving, setSaving] = useState(false)
  /* Where a control the patch does not carry keeps the position it was left in.
     The pitch wheel still moves and still reads out; it just moves nothing the
     file records, so turning it must not mark the draft unsaved either. */
  const [played, setPlayed] = useState<Record<string, ControlValue>>({})
  const { ask, dialog } = useConfirm()
  const { session, refresh: refreshSession } = useSession()
  const [view, goToView] = useView()
  const [midiHelp, setMidiHelp] = useState(false)
  /* The menu cannot hold a file input, so it holds a button that clicks one. */
  const importing = useRef<HTMLInputElement>(null)

  /* Computed before the hooks that read it, since the early return for a missing
     draft comes after them. */
  const dirty = draft !== null && signature(draft) !== clean

  const refresh = useCallback(async () => {
    const [patches, bank, shelf, categories] = await Promise.all([
      store.list(),
      store.listPresets(),
      store.library(),
      store.listTags(),
    ])
    setSaved(patches)
    setPresets(bank)
    setLibrary(shelf)
    setTags(categories)
  }, [])

  useEffect(() => {
    void (async () => {
      const fresh = createPatch({ name: 'Untitled' })
      setDraft(fresh)
      setClean(signature(fresh))
      try {
        await refresh()
        setStatus('Ready')
      } catch (error) {
        /* Nothing works without the folder, so this is the one failure that has
           to be stated plainly rather than tucked into a status line. */
        setFailed(true)
        setStatus(error instanceof StoreError ? error.message : String(error))
      }
    })()
  }, [refresh])

  /* Nothing is written until Save, so leaving with edits in hand loses them. The
     browser decides the wording and will ignore this unless the page has been
     interacted with, which is exactly when it matters. */
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const run = useCallback(async (message: string, action: () => Promise<void>) => {
    try {
      await action()
      if (message) setStatus(message)
    } catch (error) {
      if (error instanceof Cancelled) return
      setStatus(error instanceof StoreError ? error.message : `Failed: ${String(error)}`)
    }
  }, [])

  const refreshTagUse = useCallback(async () => {
    setTagUse(await store.listTagsInUse())
  }, [])

  /* Asked for only on the page that shows it: the counts are over everybody's
     patches, so the route refuses anyone else and every other page would be
     making a call it cannot use. */
  useEffect(() => {
    if (view !== 'admin' || session?.admin !== true) return
    void (async () => {
      await run('', refreshTagUse)
    })()
  }, [view, session?.admin, refreshTagUse, run])

  const addTag = useCallback(
    (name: string) =>
      void run(`Added ${name}`, async () => {
        await store.addTag(name)
        await Promise.all([refreshTagUse(), refresh()])
      }),
    [run, refreshTagUse, refresh],
  )

  const removeTag = useCallback(
    (tag: TagInUse) =>
      void run(`Removed ${tag.name}`, async () => {
        const agreed = await ask({
          title: `Remove ${tag.name} from the list?`,
          body:
            tag.patches === 0
              ? 'Nothing is wearing it.'
              : `${tag.patches === 1 ? 'One patch wears' : `${tag.patches} patches wear`} this tag and will keep it. It only stops being offered when a patch is saved.`,
          confirm: 'Remove',
          destructive: true,
        })
        if (!agreed) throw new Cancelled()
        await store.removeTag(tag.id)
        await Promise.all([refreshTagUse(), refresh()])
      }),
    [run, ask, refreshTagUse, refresh],
  )

  const importFile = useCallback(
    (file: File) =>
      run('', async () => {
        const parsed = parseBundle(await file.text())
        if (!parsed.ok) {
          setStatus(`Import failed — ${parsed.error}`)
          return
        }
        for (const patch of parsed.value.patches) await store.create(patch)
        await refresh()
        const { patches, rejected } = parsed.value
        setStatus(
          `Imported ${patches.length} patch(es)` +
            (rejected.length
              ? `; skipped ${rejected.length}: ${rejected.map((r) => `#${r.index} ${r.reason}`).join('; ')}`
              : ''),
        )
      }),
    [refresh, run],
  )

  const adopt = useCallback(
    (patch: Patch, message: string, options: { stored?: boolean; from?: string | null } = {}) => {
      setDraft(patch)
      setClean(signature(patch))
      setReport(resolvePatch(panelRegistry, patch).report)
      setStored(options.stored ?? false)
      setCopiedFrom(options.from ?? null)
      setStatus(message)
    },
    [],
  )


  /* A preset is already in hand; a saved patch has to be fetched, because its
     summary carries no values. */
  const fetchEntry = useCallback(
    async (entry: LibraryEntry): Promise<Patch | null> =>
      entry.origin === 'factory'
        ? (presets.find((preset) => preset.id === entry.id) ?? null)
        : await store.get(entry.id),
    [presets],
  )

  /* Opening is the row's whole job, so it loads and moves to the editor in one
     go rather than loading in place and leaving you on the list. A preset opens
     as a copy, because saving afterwards must not write back over it; a patch of
     your own opens as itself, so saving updates the one you picked. */
  const openEntry = useCallback(
    (entry: LibraryEntry) =>
      void run('', async () => {
        const patch = await fetchEntry(entry)
        if (!patch) return
        const factory = entry.origin === 'factory'
        const writable = !factory && entry.mine
        adopt(
          writable
            ? patch
            : copyOf(patch, {
                owner: factory ? null : { id: null, name: entry.ownerName },
              }),
          `Opened “${patch.name}”`,
          writable ? { stored: true } : { from: entry.id },
        )
        goToView('editor')
      }),
    [adopt, fetchEntry, goToView, run],
  )

  /* Nothing is drawn until the session is known, so a signed-out visitor never
     sees an editor they cannot save from, and a signed-in one never sees the
     door. */
  if (!session) return <Typography sx={{ p: 2 }}>Loading…</Typography>
  if (!session.signedIn) return <SignIn returnTo={`/#/${view}`} />

  if (!draft) return <Typography sx={{ p: 2 }}>Loading…</Typography>

  const resolved = resolvePatch(panelRegistry, draft)

  /* Only a draft the server already holds as mine is written over. Everything
     else is created: a copy when it came from somewhere, a first save when it
     did not. */
  const outcome: SaveOutcome = stored ? 'overwrite' : copiedFrom ? 'duplicate' : 'new'

  /* The library row for what the editor is showing, which is where its ratings
     live: a patch of mine is its own row, and a copy not saved yet still rates
     what it was opened from — a factory preset is rated by the person who has
     just played it, not by whoever keeps a copy. A first draft matches nothing
     and cannot be rated until it has been saved. */
  const rated = library.find((entry) => entry.id === (stored ? draft.id : copiedFrom)) ?? null

  const menu: TopBarAction[] = [
    { label: 'Import a file…', onSelect: () => importing.current?.click() },
    /* Discoverable from here because there is nowhere on the instrument it
       could go: a Model D has no MIDI socket to label. */
    { label: 'Playing over MIDI…', onSelect: () => setMidiHelp(true) },
    {
      label: 'Export every patch',
      onSelect: () =>
        void run('Exported every patch', async () => {
          const all = await Promise.all(saved.map((summary) => store.get(summary.id)))
          const present = all.filter((patch): patch is Patch => patch !== null)
          downloadJson('all-patches.moogpatch.json', serializeBundle(createBundle(present)))
        }),
    },
    /* Shown to an admin only, which the server decides: MOOG_ADMINS is read per
       request, so adding somebody is a line in the .env and a restart. */
    ...(session.admin
      ? [{ label: 'Administration', separated: true, onSelect: () => goToView('admin') }]
      : []),
    ...(session?.mode === 'oauth'
      ? [
          {
            label: `Sign out${session.user?.name ? ` (${session.user.name})` : ''}`,
            separated: true,
            onSelect: () =>
              void signOut().then(() => {
                refreshSession()
                window.location.reload()
              }),
          },
        ]
      : []),
  ]

  return (
    <>
      <TopBar view={view} onView={goToView} actions={menu}>
        <NowPlaying />
      </TopBar>
      {/* The whole editor, not each control: a drag that starts a hair off a knob,
          or a double click meant for its value box, otherwise selects whatever
          caption it landed on and leaves it highlighted behind the panel. The
          library keeps its text selectable. */}
      <Box
        component="main"
        className={view === 'editor' ? surface.noSelect : undefined}
        sx={{ p: 2 }}
      >
        <Stack spacing={2}>
        {failed && (
          <Alert severity="error">
            <AlertTitle>The patch server is not answering</AlertTitle>
            Nothing can be loaded or saved. Start it with <code>bun run dev</code>.
          </Alert>
        )}

        {view === 'editor' && (
          <>
        {/* The panel does not name what it is showing, so the patch says so above
            it: the same bar the library's rows are drawn from. */}
        <Paper variant="outlined" sx={{ borderRadius: '10px' }}>
          <PatchHeader
            name={draft.name}
            tags={draft.tags}
            instrument={draft.instrument}
            origin={null}
            approximate={draft.approximate}
            rating={rated?.rating ?? null}
            average={rated?.averageRating ?? null}
            ratingCount={rated?.ratingCount ?? 0}
            onRate={
              rated === null
                ? undefined
                : (stars) =>
                    void run('', async () => {
                      await store.rate(rated.id, stars)
                      await refresh()
                    })
            }
            actions={[
              {
                /* One button, named after what it will do: pressing Save on a
                   patch that is not yours cannot write over it, so it says
                   Duplicate rather than reporting a refusal afterwards. */
                label: outcome === 'duplicate' ? 'Duplicate' : 'Save',
                tone: 'green',
                /* Not disabled on a clean panel: the form is also how a patch
                   is named, tagged and published, none of which the panel
                   marks as an edit. */
                onSelect: () => setSaving(true),
              },
              {
                label: 'Delete',
                tone: 'pink',
                /* Only a draft the server has is there to delete. */
                disabled: !stored,
                onSelect: () =>
                  void run(`Deleted “${draft.name}”`, async () => {
                    if (
                      !(await ask({
                        title: `Delete “${draft.name || '(unnamed)'}”?`,
                        confirm: 'Delete',
                        destructive: true,
                      }))
                    ) {
                      throw new Cancelled()
                    }
                    await store.delete(draft.id)
                    await refresh()
                  }),
              },
              {
                label: 'Export',
                tone: 'blue',
                onSelect: () =>
                  void run(`Exported “${draft.name}”`, async () => {
                    /* The draft as it stands, not the panel's resolved values: a
                       control the patch does not carry falls through to the
                       registry default, and writing that default into the file
                       turns an honest omission into a stored setting. */
                    downloadJson(
                      `${slugify(draft.name) || 'patch'}.moogpatch.json`,
                      serializeBundle(createBundle([draft])),
                    )
                  }),
              },
            ]}
          />
        </Paper>

        <FitToWidth>
          <Panel
            registry={panelRegistry}
            values={{ ...resolved.values, ...played }}
            onChange={(id, next) => {
              const def = panelRegistry.control(id)
              if (def && !isRecalled(def)) {
                setPlayed((previous) => ({ ...previous, [id]: next }))
                return
              }
              setDraft({
                ...draft,
                values: mergeValues(panelRegistry, draft, { ...resolved.values, [id]: next }),
              })
            }}
          />
        </FitToWidth>

        <Section title={dirty ? 'Working draft — unsaved' : 'Working draft'}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                onClick={() =>
                  void run('', async () => {
                    if (
                      dirty &&
                      !(await ask({
                        title: 'Start a new draft?',
                        body: 'The panel has changes that have not been saved. They are lost.',
                        confirm: 'Discard and start new',
                        destructive: true,
                      }))
                    ) {
                      throw new Cancelled()
                    }
                    adopt(createPatch({ name: 'Untitled' }), 'Started a new draft')
                  })
                }
              >
                New
              </Button>
            </Stack>
          </Stack>
        </Section>

          </>
        )}

        {view === 'midi' && <PlayMidi entries={library} loadPatch={fetchEntry} />}

        {view === 'library' && (
          <PatchLibrary
            entries={library}
            onOpen={openEntry}
            onRate={(entry, stars) =>
              void run('', async () => {
                await store.rate(entry.id, stars)
                await refresh()
              })
            }
          />
        )}

        {/* Reachable by typing the address, so it says no rather than drawing an
            empty list every button on which is refused. */}
        {view === 'admin' &&
          (session.admin ? (
            <AdminPage tags={tagUse} onAdd={addTag} onRemove={removeTag} />
          ) : (
            <Alert severity="warning">
              <AlertTitle>Administration</AlertTitle>
              This page is for administrators, and this account is not one.
            </Alert>
          ))}

        {view === 'editor' && report && reportHasWarnings(report) && (
          <Alert severity="warning">
            <AlertTitle>The patch that was loaded did not fit the panel exactly</AlertTitle>
            <ul style={{ margin: 0, paddingInlineStart: '1.2em' }}>
              {report.unknown.length > 0 && (
                <li>Unknown control ids kept: {report.unknown.join(', ')}</li>
              )}
              {report.coerced.map((note) => (
                <li key={`c-${note.id}`}>
                  Coerced {note.id}: {note.reason}
                </li>
              ))}
              {report.invalid.map((note) => (
                <li key={`i-${note.id}`}>
                  Reset {note.id} to default: {note.reason}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        {view === 'editor' && (
        <Accordion variant="outlined" disableGutters>
          <AccordionSummary>
            <Typography variant="h6" component="h2">
              Every control on the instrument
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <PanelChecklist registry={panelRegistry} />
          </AccordionDetails>
        </Accordion>
        )}
        </Stack>
      </Box>

      <MidiHelp open={midiHelp} onClose={() => setMidiHelp(false)} />

      {/* Out of the flow: the menu's Import clicks this. */}
      <input
        type="file"
        accept=".json,application/json"
        hidden
        ref={importing}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importFile(file)
        }}
      />

      <Snackbar
        open={status !== ''}
        message={status}
        autoHideDuration={4000}
        onClose={() => setStatus('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      />
      <SavePatchDialog
        open={saving}
        patch={draft}
        outcome={outcome}
        tagChoices={tags}
        onCancel={() => setSaving(false)}
        onSave={(fields: PatchFields) =>
          void run(outcome === 'duplicate' ? 'Saved a copy' : 'Saved', async () => {
            setSaving(false)
            const edited = { ...draft, ...fields, tags: [...fields.tags] }
            /* Only the server mints an id, so a draft it has never seen is
               created rather than written over — which is what makes saving a
               loaded preset impossible to do over the top. */
            const kept = stored
              ? await store.save({ ...edited, updatedAt: new Date().toISOString() })
              : await store.create(edited, copiedFrom ?? undefined)
            setDraft(kept)
            setClean(signature(kept))
            setStored(true)
            setCopiedFrom(null)
            await refresh()
          })
        }
      />
      {dialog}
    </>
  )
}
