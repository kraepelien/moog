import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { AdminPage } from './admin/AdminPage.tsx'
import { AdminNav } from './admin/AdminNav.tsx'
import { LayoutPage } from './admin/LayoutPage.tsx'
import { UsersPage } from './admin/UsersPage.tsx'
import type { Decision } from './admin/UserAccess.tsx'
import type { AdminUser } from './admin/users.ts'
import { paletteOf, type Tag, type TagInUse } from './admin/tags.ts'
import { FitToWidth } from './components/FitToWidth.tsx'
import { HomePage } from './components/home/HomePage.tsx'
import { MidiHelp } from './components/MidiHelp.tsx'
import { PatchBar, type PatchBarButton } from './components/PatchBar.tsx'
import { PreviewBanner } from './components/PreviewBanner.tsx'
import { SideRail, type RailAction } from './components/SideRail.tsx'
import shell from './components/shell.module.css'
import surface from './components/controlSurface.module.css'
import { PatchLibrary } from './components/library/PatchLibrary.tsx'
import { NowPlaying } from './components/midi/NowPlaying.tsx'
import { PlayMidi } from './components/midi/PlayMidi.tsx'
import type { Desk } from './components/midi/desk.ts'
import {
  SavePatchDialog,
  type PatchFields,
  type SaveOutcome,
} from './components/library/SavePatchDialog.tsx'
import type { LibraryEntry } from './components/library/entry.ts'
import { Panel, PanelChecklist } from './components/Panel.tsx'
import { useConfirm } from './components/useConfirm.tsx'
import { SignIn } from './session/SignIn.tsx'
import { signOut, useSession, type Session } from './session/session.ts'
import { webMidiSupported } from './audio/useMidi.ts'
import { AccessProvider } from './access/AccessProvider.tsx'
import { useCan } from './access/context.ts'
import { Can, RouteGuard } from './access/Can.tsx'
import { PRIVILEGE, type Privilege, type Role } from './access/privileges.ts'
import { panelRegistry } from './controls/panel.ts'
import { isRecalled } from './controls/recall.ts'
import type { ControlValue } from './controls/types.ts'
import { mergeValues, resolvePatch, reportHasWarnings, type ResolveReport } from './patch/resolve.ts'
import { copyOf } from './patch/copy.ts'
import { createPatch, type Patch } from './patch/schema.ts'
import { applySkin } from './skin.ts'
import type { Skin } from './tones.ts'
import { createHttpStore } from './storage/httpStore.ts'
import { StoreError, type PatchSummary } from './storage/types.ts'
import { createBundle, parseBundle, serializeBundle } from './transfer/bundle.ts'
import { useLocation, useNavigationBlock, useRoute } from './navigation/router.ts'
import { pathFor } from './navigation/routes.ts'

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

/* Nothing is drawn until the session is known, so a signed-out visitor never
   sees an editor they cannot save from, and a signed-in one never sees the
   door. The privileges are put in reach of every component at the same moment,
   because until the session has arrived there is no honest answer to give. */
export function App({
  skin,
  keepSkin,
  railCollapsed,
  keepRail,
}: {
  skin: Skin
  keepSkin: (next: Skin) => boolean
  railCollapsed: boolean
  keepRail: (next: boolean) => void
}) {
  const { session, refresh } = useSession()
  const [{ route }] = useRoute()
  const here = useLocation()

  if (!session) return <Typography sx={{ p: 2 }}>Loading…</Typography>
  if (!session.signedIn) {
    /* A sign-in that failed comes back with a reason in the query, and this is
       the page that can say it. */
    const error = new URLSearchParams(here.split('?')[1] ?? '').get('error')
    return <SignIn returnTo={route.path} error={error} />
  }

  return (
    <AccessProvider privileges={session.privileges}>
      <Workspace
        session={session}
        refreshSession={refresh}
        skin={skin}
        keepSkin={keepSkin}
        railCollapsed={railCollapsed}
        keepRail={keepRail}
      />
    </AccessProvider>
  )
}

function Workspace({
  session,
  refreshSession,
  skin: painted,
  keepSkin,
  railCollapsed,
  keepRail,
}: {
  session: Session
  refreshSession: () => void
  /* Already on the document by the time this renders — it was painted before
     the first frame. Taken as a prop so the layout page starts from what is
     actually on the screen rather than from nothing. */
  skin: Skin
  /* Writes the preview where a reload will find it, and answers whether the
     browser would keep it. A function rather than the store itself, so nothing
     below here learns that a `Storage` exists. */
  keepSkin: (next: Skin) => boolean
  /* Where the rail was left last time, and where to write it when it moves.
     State here rather than in the rail, because a rail that held its own would
     start unfolded for a frame before this arrived. */
  railCollapsed: boolean
  keepRail: (next: boolean) => void
}) {
  const [collapsed, setCollapsed] = useState(railCollapsed)
  const [draft, setDraft] = useState<Patch | null>(null)
  const [saved, setSaved] = useState<readonly PatchSummary[]>([])
  const [library, setLibrary] = useState<readonly LibraryEntry[]>([])
  /* The categories an admin keeps, which is what the save form offers — not the
     tags patches happen to wear, or a bank nothing is tagged in yet could never
     be given its first one. */
  const [tags, setTags] = useState<readonly Tag[]>([])
  /* The same list with its usage counts, which only an admin may ask for and
     only the admin page shows. */
  const [tagUse, setTagUse] = useState<readonly TagInUse[]>([])
  /* What went wrong, if anything. Successes used to travel this way too and
     went out with the snackbar: a patch that opened is on the screen, and a
     patch that saved says so in its own name. A failure has nowhere else to
     appear, so it stays, in the page rather than over it. */
  const [problem, setProblem] = useState('')
  const [report, setReport] = useState<ResolveReport | null>(null)
  const [failed, setFailed] = useState(false)
  /* What the draft looked like when it was last saved or loaded. Comparing
     against it is what tells the user there is something unsaved. */
  const [clean, setClean] = useState('')
  /* Whether the server has this draft *and* will let me write it back. A patch
     of my own is written over; anything else — a factory patch, somebody
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
  const [{ route }, navigate] = useRoute()
  const mayAdminTags = useCan(PRIVILEGE.AdminTags)
  const mayAdminUsers = useCan(PRIVILEGE.AdminUsers)
  const [users, setUsers] = useState<readonly AdminUser[]>([])
  /* What this device is being shown in, which is also what the layout page's
     fields show. One value and no draft beside it: there is nothing to save it
     to, so choosing a colour and keeping it are the same act. Held here rather
     than on the page because the preview outlives the page. */
  const [skin, setSkin] = useState<Skin>(painted)
  const [keeping, setKeeping] = useState(true)
  const [midiHelp, setMidiHelp] = useState(false)
  /* The menu cannot hold a file input, so it holds a button that clicks one. */
  const importing = useRef<HTMLInputElement>(null)

  /* Computed before the hooks that read it, since the early return for a missing
     draft comes after them. */
  const dirty = draft !== null && signature(draft) !== clean

  /* The two views of the same list: what the save form may offer, and what
     colour each one is drawn in wherever it appears. */
  const tagNames = useMemo(() => tags.map((tag) => tag.name), [tags])
  const tagPalette = useMemo(() => paletteOf(tags), [tags])

  const refresh = useCallback(async () => {
    const [patches, shelf, categories] = await Promise.all([
      store.list(),
      store.library(),
      store.listTags(),
    ])
    setSaved(patches)
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
      } catch (error) {
        /* Nothing works without the folder, so this is the one failure that has
           to be stated plainly rather than tucked into a status line. */
        setFailed(true)
        setProblem(error instanceof StoreError ? error.message : String(error))
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

  /* The other half of that: `beforeunload` covers closing the tab and reloading,
     and a move between pages is neither, so pressing Patch library with a dirty
     panel used to discard it without asking. This is the app's own dialog rather
     than the browser's — `beforeunload` has to make do with wording Chrome
     chooses, and this does not. */
  useNavigationBlock(dirty, () =>
    ask({
      title: 'Leave the editor?',
      body: 'The panel has changes that have not been saved. They are lost.',
      confirm: 'Discard and leave',
      destructive: true,
    }),
  )

  const run = useCallback(
    async (action: () => Promise<void>) => {
      try {
        setProblem('')
        await action()
      } catch (error) {
        if (error instanceof Cancelled) return
        setProblem(error instanceof StoreError ? error.message : `Failed: ${String(error)}`)

        /* A refusal means this browser's idea of what it may do is out of date —
           somebody has been given something, or had it taken away, since the
           page loaded. Asking again here is what makes the buttons correct
           themselves without polling for a change that almost never comes. */
        if (error instanceof StoreError && error.kind === 'forbidden') refreshSession()
      }
    },
    [refreshSession],
  )

  const refreshTagUse = useCallback(async () => {
    setTagUse(await store.listTagsInUse())
  }, [])

  const refreshUsers = useCallback(async () => {
    setUsers(await store.listUsers())
  }, [])

  /* Asked for only on the page that shows it, like the tag counts: everybody
     else would be making a call the route refuses. */
  useEffect(() => {
    if (route.name !== 'users' || !mayAdminUsers) return
    void (async () => {
      await run(refreshUsers)
    })()
  }, [route.name, mayAdminUsers, refreshUsers, run])

  /* The list is replaced from what the write returned rather than re-fetched:
     the server answers with the account as it now stands, so a second call
     would only be a chance for the two to disagree. */
  const replaceUser = useCallback((changed: AdminUser) => {
    setUsers((held) => held.map((one) => (one.uid === changed.uid ? changed : one)))
  }, [])

  /* Changing your own access changes what this page may draw, so the session is
     asked again — otherwise the buttons keep claiming something that is no
     longer true about the person pressing them. */
  const afterSelfEdit = useCallback(
    (uid: string) => {
      if (uid === session.user?.uid) refreshSession()
    },
    [refreshSession, session.user?.uid],
  )

  const decidePrivilege = useCallback(
    (user: AdminUser, privilege: Privilege, decision: Decision) =>
      void run(async () => {
        const changed =
          decision === 'inherited'
            ? await store.clearUserPrivilege(user.uid, privilege)
            : await store.setUserPrivilege(user.uid, privilege, decision === 'granted')
        replaceUser(changed)
        afterSelfEdit(user.uid)
      }),
    [run, replaceUser, afterSelfEdit],
  )

  const setUserRoles = useCallback(
    (user: AdminUser, roles: readonly Role[]) =>
      void run(async () => {
        replaceUser(await store.setUserRoles(user.uid, roles))
        afterSelfEdit(user.uid)
      }),
    [run, replaceUser, afterSelfEdit],
  )

  /* Asked for only on the page that shows it: the counts are over everybody's
     patches, so the route refuses anyone else and every other page would be
     making a call it cannot use. */
  useEffect(() => {
    if (route.name !== 'admin' || !mayAdminTags) return
    void (async () => {
      await run(refreshTagUse)
    })()
  }, [route.name, mayAdminTags, refreshTagUse, run])

  const addTag = useCallback(
    (name: string) =>
      void run(async () => {
        await store.addTag(name)
        await Promise.all([refreshTagUse(), refresh()])
      }),
    [run, refreshTagUse, refresh],
  )

  const setTagColour = useCallback(
    (tag: TagInUse, colour: string | null) =>
      void run(async () => {
        await store.setTagColour(tag.id, colour)
        await Promise.all([refreshTagUse(), refresh()])
      }),
    [run, refreshTagUse, refresh],
  )

  const removeTag = useCallback(
    (tag: TagInUse) =>
      void run(async () => {
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

  /* The layout page previews by painting, so a colour goes onto the document as
     soon as it is picked. Nothing else in the app has to hear about it: every
     colour anything draws with is one of these properties. */
  const paint = useCallback(
    (next: Skin) => {
      setSkin(next)
      setKeeping(keepSkin(next))
      applySkin(next, document.documentElement)
    },
    [keepSkin],
  )

  const importFile = useCallback(
    (file: File) =>
      run(async () => {
        const parsed = parseBundle(await file.text())
        if (!parsed.ok) {
          setProblem(`Import failed — ${parsed.error}`)
          return
        }
        for (const patch of parsed.value.patches) await store.create(patch)
        await refresh()
        /* The patches that arrived are in the library to be looked at; what was
           left behind is the only part of this nobody can see. */
        const { rejected } = parsed.value
        if (rejected.length > 0) {
          setProblem(
            `Skipped ${rejected.length}: ${rejected.map((r) => `#${r.index} ${r.reason}`).join('; ')}`,
          )
        }
      }),
    [refresh, run],
  )

  const adopt = useCallback(
    (patch: Patch, options: { stored?: boolean; from?: string | null } = {}) => {
      setDraft(patch)
      setClean(signature(patch))
      setReport(resolvePatch(panelRegistry, patch).report)
      setStored(options.stored ?? false)
      setCopiedFrom(options.from ?? null)
    },
    [],
  )


  /* The five calls the MIDI desk needs, named after what it does with them
     rather than handed the whole store. */
  const desk: Desk = useMemo(
    () => ({
      list: () => store.listArrangements(),
      get: (id) => store.getArrangement(id),
      create: (arrangement) => store.createArrangement(arrangement),
      save: (id, arrangement) => store.saveArrangement(id, arrangement),
      remove: (id) => store.deleteArrangement(id),
      patch: (id) => store.get(id),
    }),
    [],
  )

  /* Opening is the row's whole job, so it loads and moves to the editor in one
     go rather than loading in place and leaving you on the list. A factory patch
     opens as a copy, because saving afterwards must not write back over it; a
     patch of your own opens as itself, so saving updates the one you picked. */
  const openEntry = useCallback(
    (entry: LibraryEntry) =>
      void run(async () => {
        /* Fetched whatever it is: a row carries no values, and a factory patch
           is read through the same call as any other. */
        const patch = await store.get(entry.id)
        if (!patch) return
        const factory = entry.origin === 'factory'
        const writable = !factory && entry.mine
        adopt(
          writable
            ? patch
            : copyOf(patch, {
                owner: factory ? null : { id: null, name: entry.ownerName },
              }),
          writable ? { stored: true } : { from: entry.id },
        )
        navigate(pathFor('editor'))
      }),
    [adopt, navigate, run],
  )

  if (!draft) return <Typography sx={{ p: 2 }}>Loading…</Typography>

  const resolved = resolvePatch(panelRegistry, draft)

  /* Only a draft the server already holds as mine is written over. Everything
     else is created: a copy when it came from somewhere, a first save when it
     did not. */
  const outcome: SaveOutcome = stored ? 'overwrite' : copiedFrom ? 'duplicate' : 'new'

  /* The library row for what the editor is showing: a patch of mine is its own
     row, and a copy not saved yet still points at what it was opened from — a
     factory patch is rated by the person who has just played it, not by whoever
     keeps a copy. It is where the stars in the save form live, and it is what
     the library marks so the list says which one is loaded. A first draft
     matches nothing and can be neither rated nor pointed at. */
  const openRow = library.find((entry) => entry.id === (stored ? draft.id : copiedFrom)) ?? null

  /* What can be done to the open patch, in the editor page beside the name of
     what is open. */
  const editorButtons: PatchBarButton[] = [
    {
      /* An empty panel, at the positions a Model D is left in. Beside Save
         rather than under the panel in a section of its own, which is where it
         was and where nobody found it. */
      label: 'Init',
      tone: 'amber',
      onSelect: () =>
        void run(async () => {
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
          adopt(createPatch({ name: 'Untitled' }))
        }),
    },
    {
      /* One button, named after what it will do: pressing Save on a patch that
         is not yours cannot write over it, so it says Duplicate rather than
         reporting a refusal afterwards. */
      label: outcome === 'duplicate' ? 'Duplicate' : 'Save',
      tone: 'green',
      /* Not disabled on a clean panel: the form is also how a patch is named,
         tagged and published, none of which the panel marks as an edit. */
      onSelect: () => setSaving(true),
    },
    {
      label: 'Delete',
      tone: 'pink',
      /* Only a draft the server has is there to delete. */
      disabled: !stored,
      onSelect: () =>
        void run(async () => {
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
        void run(async () => {
          /* The draft as it stands, not the panel's resolved values: a control
             the patch does not carry falls through to the registry default, and
             writing that default into the file turns an honest omission into a
             stored setting. */
          downloadJson(
            `${slugify(draft.name) || 'patch'}.moogpatch.json`,
            serializeBundle(createBundle([draft])),
          )
        }),
    },
  ]

  const menu: RailAction[] = [
    { label: 'Import a file…', onSelect: () => importing.current?.click() },
    /* Discoverable from here because there is nowhere on the instrument it
       could go: a Model D has no MIDI socket to label. A browser without Web
       MIDI ignores a controller in silence, so the label has to say so. */
    {
      label: webMidiSupported() ? 'Playing over MIDI…' : 'Playing over MIDI (not in this browser)…',
      onSelect: () => setMidiHelp(true),
    },
    {
      label: 'Export every patch',
      onSelect: () =>
        void run(async () => {
          const all = await Promise.all(saved.map((summary) => store.get(summary.id)))
          const present = all.filter((patch): patch is Patch => patch !== null)
          downloadJson('all-patches.moogpatch.json', serializeBundle(createBundle(present)))
        }),
    },
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
      <Box className={shell.shell}>
        <SideRail
          route={route}
          onNavigate={navigate}
          actions={menu}
          collapsed={collapsed}
          onCollapse={(next) => {
            setCollapsed(next)
            keepRail(next)
          }}
        />

        <Box className={shell.page}>
          {/* Above everything else, on every page: the colours follow you off the
              layout page, so this is what says why. */}
          <PreviewBanner skin={skin} onReset={() => paint({})} />
          {/* The whole editor, not each control: a drag that starts a hair off a knob,
              or a double click meant for its value box, otherwise selects whatever
              caption it landed on and leaves it highlighted behind the panel. The
              library keeps its text selectable. */}
          <Box
            component="main"
            className={route.name === 'editor' ? surface.noSelect : undefined}
            sx={{ p: 2 }}
          >
            <Stack spacing={2}>
            {/* Not on the MIDI page, which has the way back and the way off it in
                front of you; everywhere else a file left playing needs both. */}
            <NowPlaying />

            {route.name === 'editor' && (
              <PatchBar title={{ text: draft.name, unsaved: dirty }} buttons={editorButtons} />
            )}

            {route.name === 'home' && (
              <HomePage
                entries={library}
                tagPalette={tagPalette}
                onNavigate={navigate}
                onOpen={openEntry}
              />
            )}

            {failed && (
              <Alert severity="error">
                <AlertTitle>The patch server is not answering</AlertTitle>
                Nothing can be loaded or saved. Start it with <code>bun run dev</code>.
              </Alert>
            )}

            {/* In the page rather than over it. A refusal is the one thing here
                nothing else on the screen can be read for, so it waits to be
                dismissed instead of timing out while somebody is looking down. */}
            {problem !== '' && !failed && (
              <Alert severity="error" onClose={() => setProblem('')}>
                {problem}
              </Alert>
            )}

            {route.name === 'editor' && (
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
            )}

            {route.name === 'midi' && (
              <PlayMidi
                entries={library}
                loadPatch={(id) => store.get(id)}
                desk={desk}
                onProblem={setProblem}
              />
            )}

            {route.name === 'library' && (
              <PatchLibrary
                entries={library}
                openId={openRow?.id ?? null}
                tagPalette={tagPalette}
                onOpen={openEntry}
                onRate={(entry, stars) =>
                  void run(async () => {
                    await store.rate(entry.id, stars)
                    await refresh()
                  })
                }
              />
            )}

            {/* Reachable by typing the address, so the guard says no rather than
                drawing an empty list every button on which is refused. Opening the
                area and editing the tag list are separate privileges, so the panel
                asks for its own on top of what the page needed. */}
            {route.path.startsWith('/admin') && (
              <RouteGuard privilege={route.needs} title={route.title}>
                <Stack spacing={2}>
                  <AdminNav here={route} onNavigate={navigate} />

                  {route.name === 'admin' && (
                    <Can
                      privilege={PRIVILEGE.AdminTags}
                      otherwise={
                        <Alert severity="info">
                          <AlertTitle>Tags</AlertTitle>
                          Editing the tag list is not part of what this account administers.
                        </Alert>
                      }
                    >
                      <AdminPage
                        tags={tagUse}
                        skin={skin}
                        onAdd={addTag}
                        onColour={setTagColour}
                        onRemove={removeTag}
                      />
                    </Can>
                  )}

                  {route.name === 'layout' && (
                    <LayoutPage skin={skin} keeping={keeping} onSkin={paint} />
                  )}

                  {route.name === 'users' && (
                    <UsersPage users={users} onDecide={decidePrivilege} onRoles={setUserRoles} />
                  )}
                </Stack>
              </RouteGuard>
            )}

            {route.name === 'editor' && report && reportHasWarnings(report) && (
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

            {route.name === 'editor' && (
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
        </Box>
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

      <SavePatchDialog
        open={saving}
        patch={draft}
        outcome={outcome}
        tagChoices={tagNames}
        tagPalette={tagPalette}
        rating={openRow?.rating ?? null}
        average={openRow?.averageRating ?? null}
        ratingCount={openRow?.ratingCount ?? 0}
        onCancel={() => setSaving(false)}
        onRate={
          openRow === null
            ? undefined
            : (stars) =>
                void run(async () => {
                  await store.rate(openRow.id, stars)
                  await refresh()
                })
        }
        onSave={(fields: PatchFields) =>
          void run(async () => {
            setSaving(false)
            const edited = { ...draft, ...fields, tags: [...fields.tags] }
            /* Only the server mints an id, so a draft it has never seen is
               created rather than written over — which is what makes saving a
               loaded factory patch impossible to do over the top. */
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
