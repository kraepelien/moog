import { useCallback, useEffect, useRef, useState } from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { FitToWidth } from './components/FitToWidth.tsx'
import { TopBar, type TopBarAction } from './components/TopBar.tsx'
import { Panel, PanelChecklist } from './components/Panel.tsx'
import { useConfirm } from './components/useConfirm.tsx'
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
  const [status, setStatus] = useState('')
  const [report, setReport] = useState<ResolveReport | null>(null)
  const [failed, setFailed] = useState(false)
  /* What the draft looked like when it was last saved or loaded. Comparing
     against it is what tells the user there is something unsaved. */
  const [clean, setClean] = useState('')
  /* Whether the server has this draft yet. A new one is created, an existing
     one written over, and only the server ever mints an id. */
  const [stored, setStored] = useState(false)
  /* What the draft was copied from, until it has been saved once. */
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null)
  /* Where a control the patch does not carry keeps the position it was left in.
     The pitch wheel still moves and still reads out; it just moves nothing the
     file records, so turning it must not mark the draft unsaved either. */
  const [played, setPlayed] = useState<Record<string, ControlValue>>({})
  const { ask, dialog } = useConfirm()
  const [view, goToView] = useView()
  /* The menu cannot hold a file input, so it holds a button that clicks one. */
  const importing = useRef<HTMLInputElement>(null)

  /* Computed before the hooks that read it, since the early return for a missing
     draft comes after them. */
  const dirty = draft !== null && signature(draft) !== clean

  const refresh = useCallback(async () => {
    const [patches, bank] = await Promise.all([store.list(), store.listPresets()])
    setSaved(patches)
    setPresets(bank)
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

  if (!draft) return <Typography sx={{ p: 2 }}>Loading…</Typography>

  const resolved = resolvePatch(panelRegistry, draft)

  const menu: TopBarAction[] = [
    { label: 'Import a file…', onSelect: () => importing.current?.click() },
    {
      label: 'Export every patch',
      onSelect: () =>
        void run('Exported every patch', async () => {
          const all = await Promise.all(saved.map((summary) => store.get(summary.id)))
          const present = all.filter((patch): patch is Patch => patch !== null)
          downloadJson('all-patches.moogpatch.json', serializeBundle(createBundle(present)))
        }),
    },
  ]

  return (
    <>
      <TopBar view={view} onView={goToView} actions={menu} />
      <Box component="main" sx={{ p: 2 }}>
        <Stack spacing={2}>
        {failed && (
          <Alert severity="error">
            <AlertTitle>The patch server is not answering</AlertTitle>
            Nothing can be loaded or saved. Start it with <code>bun run dev</code>.
          </Alert>
        )}

        {view === 'editor' && (
          <>
        {/* No card and no heading: the panel is the instrument's own face, and
            it names its own sections along the bottom the way the panel does. */}
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
            <TextField
              label="Name"
              size="small"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              sx={{ maxWidth: 360 }}
            />
            <TextField
              label="Notes"
              size="small"
              multiline
              minRows={3}
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            />
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                disabled={!dirty}
                onClick={() =>
                  void run('Saved', async () => {
                    const saved = stored
                      ? await store.save({ ...draft, updatedAt: new Date().toISOString() })
                      : await store.create(draft, copiedFrom ?? undefined)
                    setDraft(saved)
                    setClean(signature(saved))
                    setStored(true)
                    setCopiedFrom(null)
                    await refresh()
                  })
                }
              >
                Save
              </Button>
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
              <Button
                variant="outlined"
                disabled={!stored}
                onClick={() =>
                  void run('Saved as a copy', async () => {
                    const copy = await store.create(
                      { ...draft, name: `${draft.name} copy` },
                      draft.id,
                    )
                    adopt(copy, `Saved as “${copy.name}”`, { stored: true })
                    await refresh()
                  })
                }
              >
                Save as
              </Button>
              <Button
                variant="outlined"
                onClick={() =>
                  downloadJson(
                    `${slugify(draft.name) || 'patch'}.moogpatch.json`,
                    serializeBundle(createBundle([draft])),
                  )
                }
              >
                Export this patch
              </Button>
            </Stack>
          </Stack>
        </Section>

          </>
        )}

        {view === 'library' && (
          <>
        <Section title={`Presets (${presets.length})`}>
          <List dense disablePadding>
            {presets.map((preset) => (
              <ListItem key={preset.id} divider disableGutters>
                <ListItemText
                  primary={
                    <Box
                      component="span"
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}
                    >
                      {preset.name}
                      {preset.approximate && (
                        <Chip label="approximate" size="small" variant="outlined" />
                      )}
                    </Box>
                  }
                  secondary={preset.id}
                />
                <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      onClick={() =>
                        adopt(copyOf(preset, { owner: null }), `Loaded “${preset.name}”`, {
                          from: preset.id,
                        })
                      }
                    >
                      Load
                    </Button>
                  </Stack>
              </ListItem>
            ))}
          </List>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            The factory bank ships with the app and is never written over. Loading one starts a copy
            that is yours. Values marked approximate are a reconstruction, not settings read off the
            instrument.
          </Typography>
        </Section>

        <Section title={`Saved patches (${saved.length})`}>
          <List dense disablePadding>
            {saved.map((summary) => (
              <ListItem key={summary.id} divider disableGutters>
                <ListItemText
                  primary={summary.name || '(unnamed)'}
                  secondary={summary.updatedAt}
                />
                <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      onClick={() =>
                        void run('', async () => {
                          const patch = await store.get(summary.id)
                          if (patch) adopt(patch, `Loaded “${patch.name}”`, { stored: true })
                        })
                      }
                    >
                      Load
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() =>
                        void run(`Deleted “${summary.name}”`, async () => {
                          if (
                            !(await ask({
                              title: `Delete “${summary.name || '(unnamed)'}”?`,
                              confirm: 'Delete',
                              destructive: true,
                            }))
                          ) {
                            throw new Cancelled()
                          }
                          await store.delete(summary.id)
                          await refresh()
                        })
                      }
                    >
                      Delete
                    </Button>
                  </Stack>
              </ListItem>
            ))}
          </List>
        </Section>
          </>
        )}

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
      {dialog}
    </>
  )
}
