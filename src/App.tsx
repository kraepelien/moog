import { useCallback, useEffect, useRef, useState } from 'react'
import { panelRegistry } from './controls/panel.ts'
import { resolvePatch, reportHasWarnings, type ResolveReport } from './patch/resolve.ts'
import { createPatch, type Patch } from './patch/schema.ts'
import { draftFromPreset, factoryPresets } from './presets/factory.ts'
import { createWebStorageStore, resolveBrowserStorage } from './storage/webStorage.ts'
import type { DraftStore, PatchStore, PatchSummary } from './storage/types.ts'
import { StoreError } from './storage/types.ts'
import { createBundle, parseBundle, serializeBundle } from './transfer/bundle.ts'

const { storage, persistent } = resolveBrowserStorage()
const store: PatchStore & DraftStore = createWebStorageStore(storage)

function downloadJson(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function filenameFor(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug || 'patches'}.moogpatch.json`
}

export function App() {
  const [draft, setDraft] = useState<Patch | null>(null)
  const [saved, setSaved] = useState<readonly PatchSummary[]>([])
  const [status, setStatus] = useState('')
  const [report, setReport] = useState<ResolveReport | null>(null)
  const loadedOnce = useRef(false)

  const refreshList = useCallback(async () => {
    setSaved(await store.list())
  }, [])

  useEffect(() => {
    void (async () => {
      const existing = await store.readDraft()
      setDraft(existing ?? createPatch({ name: 'Untitled' }))
      setStatus(existing ? 'Restored working draft' : 'Started a new draft')
      await refreshList()
      loadedOnce.current = true
    })()
  }, [refreshList])

  /* The draft is written back on every edit so closing the tab never loses work.
     Skipped until the initial read has landed, or the empty starting draft would
     overwrite the stored one before it arrives. */
  useEffect(() => {
    if (!loadedOnce.current || !draft) return
    void store.writeDraft(draft)
  }, [draft])

  const run = useCallback(async (message: string, action: () => Promise<void>) => {
    try {
      await action()
      setStatus(message)
    } catch (error) {
      setStatus(
        error instanceof StoreError ? `${error.kind}: ${error.message}` : `Failed: ${String(error)}`,
      )
    }
  }, [])

  const adopt = useCallback((patch: Patch, message: string) => {
    const resolved = resolvePatch(panelRegistry, patch)
    setDraft(patch)
    setReport(resolved.report)
    setStatus(message)
  }, [])

  if (!draft) return <p>Loading…</p>

  return (
    <main>
      <h1>Minimoog Model D — Patch Editor</h1>

      {!persistent && (
        <p role="status">
          This browser will not let a page opened from disk store data. Patches will be lost on
          reload.
        </p>
      )}

      <section>
        <h2>Panel</h2>
        <p>
          {panelRegistry.controls.length} controls in {panelRegistry.sections.length} sections.
          {panelRegistry.controls.length === 0 && ' No controls defined yet.'}
        </p>
      </section>

      <section>
        <h2>Working draft</h2>
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
          <small>
            id {draft.id} · schema v{draft.schemaVersion} · {Object.keys(draft.values).length} stored
            values
          </small>
        </p>
        <p>
          <button
            onClick={() =>
              void run('Saved', async () => {
                await store.save({ ...draft, updatedAt: new Date().toISOString() })
                await refreshList()
              })
            }
          >
            Save
          </button>{' '}
          <button onClick={() => adopt(createPatch({ name: 'Untitled' }), 'Started a new draft')}>
            New
          </button>{' '}
          <button
            onClick={() => downloadJson(filenameFor(draft.name), serializeBundle(createBundle([draft])))}
          >
            Export this patch
          </button>
        </p>
      </section>

      <section>
        <h2>Factory presets</h2>
        <ul>
          {factoryPresets.map((preset) => (
            <li key={preset.slug}>
              {preset.name}{' '}
              <button onClick={() => adopt(draftFromPreset(preset), `Loaded preset "${preset.name}"`)}>
                Load
              </button>
            </li>
          ))}
        </ul>
        <p>
          <small>Loading a preset starts a new unsaved patch. Presets are never overwritten.</small>
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
                    await store.delete(summary.id)
                    await refreshList()
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
            onClick={() =>
              void run('Exported all patches', async () => {
                const patches = await Promise.all(saved.map((s) => store.get(s.id)))
                const present = patches.filter((p): p is Patch => p !== null)
                downloadJson('all-patches.moogpatch.json', serializeBundle(createBundle(present)))
              })
            }
            disabled={saved.length === 0}
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
            void (async () => {
              const parsed = parseBundle(await file.text())
              if (!parsed.ok) {
                setStatus(`Import failed — ${parsed.error}`)
                return
              }
              for (const patch of parsed.value.patches) await store.save(patch)
              await refreshList()
              const { patches, rejected } = parsed.value
              setStatus(
                `Imported ${patches.length} patch(es)` +
                  (rejected.length
                    ? `; skipped ${rejected.length}: ${rejected.map((r) => `#${r.index} ${r.reason}`).join('; ')}`
                    : ''),
              )
            })()
          }}
        />
      </section>

      <section>
        <h2>Status</h2>
        <p role="status">{status}</p>
        {report && reportHasWarnings(report) && (
          <ul>
            {report.unknown.length > 0 && <li>Unknown control ids kept: {report.unknown.join(', ')}</li>}
            {report.coerced.map((note) => (
              <li key={`c-${note.id}`}>Coerced {note.id}: {note.reason}</li>
            ))}
            {report.invalid.map((note) => (
              <li key={`i-${note.id}`}>Reset {note.id} to default: {note.reason}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
