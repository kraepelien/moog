import { useCallback, useEffect, useState } from 'react'
import { Panel, PanelChecklist } from './components/Panel.tsx'
import { panelRegistry } from './controls/panel.ts'
import { mergeValues, resolvePatch, reportHasWarnings, type ResolveReport } from './patch/resolve.ts'
import { createPatch, type Patch } from './patch/schema.ts'
import { draftFromPreset, presetFromDraft, type StoredPreset } from './presets/preset.ts'
import { createHttpStore } from './storage/httpStore.ts'
import { StoreError, type PatchSummary } from './storage/types.ts'
import { createBundle, parseBundle, serializeBundle } from './transfer/bundle.ts'

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

export function App() {
  const [draft, setDraft] = useState<Patch | null>(null)
  const [saved, setSaved] = useState<readonly PatchSummary[]>([])
  const [presets, setPresets] = useState<readonly StoredPreset[]>([])
  const [status, setStatus] = useState('')
  const [report, setReport] = useState<ResolveReport | null>(null)
  const [failed, setFailed] = useState(false)
  /* What the draft looked like when it was last saved or loaded. Comparing
     against it is what tells the user there is something unsaved. */
  const [clean, setClean] = useState('')

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

  const adopt = useCallback((patch: Patch, message: string) => {
    setDraft(patch)
    setClean(signature(patch))
    setReport(resolvePatch(panelRegistry, patch).report)
    setStatus(message)
  }, [])

  if (!draft) return <p>Loading…</p>

  const resolved = resolvePatch(panelRegistry, draft)
  const currentValues = mergeValues(draft, resolved.values)

  return (
    <main>
      <h1>Minimoog Model D — Patch Editor</h1>

      {failed && (
        <p role="alert">
          The patch server is not answering, so nothing can be loaded or saved. Start it with{' '}
          <code>bun run dev</code>.
        </p>
      )}

      <section>
        <h2>Panel</h2>
        <Panel
          registry={panelRegistry}
          values={resolved.values}
          onChange={(id, next) =>
            setDraft({ ...draft, values: mergeValues(draft, { ...resolved.values, [id]: next }) })
          }
        />
      </section>

      <section>
        <h2>Working draft{dirty && ' — unsaved'}</h2>
        <p>
          <label>
            Name{' '}
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
        </p>
        <p>
          <label>
            Notes{' '}
            <textarea
              value={draft.notes}
              rows={3}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            />
          </label>
        </p>
        <p>
          <button
            onClick={() =>
              void run('Saved', async () => {
                const saved = { ...draft, updatedAt: new Date().toISOString() }
                await store.save(saved)
                setDraft(saved)
                setClean(signature(saved))
                await refresh()
              })
            }
          >
            Save
          </button>{' '}
          <button onClick={() => adopt(createPatch({ name: 'Untitled' }), 'Started a new draft')}>
            New
          </button>{' '}
          <button
            onClick={() =>
              downloadJson(
                `${slugify(draft.name) || 'patch'}.moogpatch.json`,
                serializeBundle(createBundle([draft])),
              )
            }
          >
            Export this patch
          </button>{' '}
          <button
            onClick={() =>
              void run('Saved as a preset', async () => {
                const slug = slugify(draft.name)
                if (!slug) {
                  setStatus('Name the patch before saving it as a preset')
                  throw new Cancelled()
                }
                if (
                  presets.some((preset) => preset.slug === slug) &&
                  !confirm(`A preset called "${slug}" already exists. Replace it?`)
                ) {
                  throw new Cancelled()
                }
                await store.savePreset(presetFromDraft(slug, draft, currentValues))
                await refresh()
              })
            }
          >
            Save as preset
          </button>
        </p>
      </section>

      <section>
        <h2>Presets ({presets.length})</h2>
        <ul>
          {presets.map((preset) => (
            <li key={preset.slug}>
              {preset.name}
              {preset.approximate && <small> · approximate</small>}{' '}
              <button onClick={() => adopt(draftFromPreset(preset), `Loaded "${preset.name}"`)}>
                Load
              </button>{' '}
              <button
                onClick={() =>
                  void run(`Overwrote "${preset.name}"`, async () => {
                    if (!confirm(`Overwrite "${preset.name}" with the values on the panel?`)) {
                      throw new Cancelled()
                    }
                    await store.savePreset(presetFromDraft(preset.slug, draft, currentValues))
                    await refresh()
                  })
                }
              >
                Overwrite
              </button>{' '}
              <button
                onClick={() =>
                  void run(`Deleted "${preset.name}"`, async () => {
                    if (
                      !confirm(
                        `Delete the preset "${preset.name}"?\n\nThis removes one file from the active presets folder. The copy kept in the repo is untouched.`,
                      )
                    ) {
                      throw new Cancelled()
                    }
                    await store.deletePreset(preset.slug)
                    await refresh()
                  })
                }
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
        <p>
          <small>
            Presets are files in the active folder. Loading one starts a new patch; overwriting and
            deleting change the file. Values marked approximate are a reconstruction, not settings
            read off the instrument.
          </small>
        </p>
      </section>

      <section>
        <h2>Saved patches ({saved.length})</h2>
        <ul>
          {saved.map((summary) => (
            <li key={summary.id}>
              {summary.name || '(unnamed)'} — {summary.updatedAt}{' '}
              <button
                onClick={() =>
                  void run('', async () => {
                    const patch = await store.get(summary.id)
                    if (patch) adopt(patch, `Loaded "${patch.name}"`)
                  })
                }
              >
                Load
              </button>{' '}
              <button
                onClick={() =>
                  void run(`Deleted "${summary.name}"`, async () => {
                    if (!confirm(`Delete the patch "${summary.name}"?`)) throw new Cancelled()
                    await store.delete(summary.id)
                    await refresh()
                  })
                }
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
        <p>
          <button
            disabled={saved.length === 0}
            onClick={() =>
              void run('Exported every patch', async () => {
                const all = await Promise.all(saved.map((summary) => store.get(summary.id)))
                const present = all.filter((patch): patch is Patch => patch !== null)
                downloadJson('all-patches.moogpatch.json', serializeBundle(createBundle(present)))
              })
            }
          >
            Export all
          </button>
        </p>
      </section>

      <section>
        <h2>Import</h2>
        <input
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            event.target.value = ''
            void run('', async () => {
              const parsed = parseBundle(await file.text())
              if (!parsed.ok) {
                setStatus(`Import failed — ${parsed.error}`)
                return
              }
              for (const patch of parsed.value.patches) await store.save(patch)
              await refresh()
              const { patches, rejected } = parsed.value
              setStatus(
                `Imported ${patches.length} patch(es)` +
                  (rejected.length
                    ? `; skipped ${rejected.length}: ${rejected.map((r) => `#${r.index} ${r.reason}`).join('; ')}`
                    : ''),
              )
            })
          }}
        />
      </section>

      <section>
        <h2>Every control on the instrument</h2>
        <PanelChecklist registry={panelRegistry} />
      </section>

      <section>
        <h2>Status</h2>
        <p role="status">{status}</p>
        {report && reportHasWarnings(report) && (
          <ul>
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
        )}
      </section>
    </main>
  )
}
