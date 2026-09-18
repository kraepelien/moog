import { useCallback, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { PatchPicker } from './PatchPicker.tsx'
import { ArrangementPicker, SaveArrangementDialog } from './Arrangements.tsx'
import type { ArrangementSummary } from './arrangement.ts'
import { openArrangement, toInput, type Desk } from './desk.ts'
import {
  chooseSound,
  dressedParts,
  holdMidiFile,
  holdMidiTrouble,
  isAudible,
  markArrangementStored,
  playMidi,
  setTempo,
  stopMidi,
  toggleMute,
  toggleSolo,
  useMidiSession,
} from './session.ts'
import { Can } from '@access/Can.tsx'
import { PRIVILEGE } from '@access/privileges.ts'
import { ToneChip } from '@components/library/ToneChip.tsx'
import type { LibraryEntry } from '@components/library/entry.ts'
import { MidiFileError, readMidiFile, type MidiChannel } from '@audio/midiFile.ts'
import type { Patch } from '@patch/schema.ts'
import { SHELL, TONE_COLOURS, type Tone } from '@/tones.ts'
import styles from './PlayMidi.module.css'

/* A file, its parts, and a sound for each.
 *
 * The instrument is one voice, so a file with four parts is four instruments
 * playing together — which is what a studio would have done with four Model Ds.
 * Each part is monophonic like the real thing, so a chord written into one
 * channel plays the note the instrument's own priority chooses rather than the
 * chord.
 *
 * A part with no sound chosen is silent rather than given a default. An
 * arbitrary sound playing under a part nobody dressed is worse than a part that
 * waits to be told.
 *
 * Nothing here is held in state: what has been loaded outlives the page, so it
 * lives in session.ts and this draws it.
 */

const PERCUSSION_CHANNEL = 10

function partName(part: MidiChannel): string {
  return part.name ?? `Channel ${part.channel}`
}

/* One of the desk's two switches, lit or unlit. Filled when it is on, because a
   row of these is read at a glance and a tinted outline is not a state anyone
   can see from across the room. */
function Flag({
  letter,
  title,
  tone,
  ink,
  on,
  onPress,
}: {
  letter: string
  title: string
  tone: Tone
  /* Text for the lit state, dark enough to read on the colour. */
  ink: string
  on: boolean
  onPress: () => void
}) {
  const colour = TONE_COLOURS[tone]
  return (
    <Button
      className={styles.flag}
      aria-label={title}
      aria-pressed={on}
      onClick={onPress}
      sx={{
        color: on ? ink : colour.ink,
        backgroundColor: on ? colour.ink : colour.field,
        '&:hover': { backgroundColor: on ? colour.ink : colour.strong },
      }}
    >
      {letter}
    </Button>
  )
}

export function PlayMidi({
  entries,
  loadPatch,
  desk,
  onProblem,
}: {
  entries: readonly LibraryEntry[]
  /* The library holds summaries; playing needs the values, so the page that has
     a store hands this down rather than this one reaching for it. */
  loadPatch: (entry: LibraryEntry) => Promise<Patch | null>
  /* Saving and reopening, for whoever the server grants StoreMidi. The buttons
     below are hidden without it and the routes refuse without it, so this is
     handed down unconditionally rather than being a privilege in two places. */
  desk: Desk
  /* Only what went wrong. There is no notification surface for a success any
     more, and “it worked” was the half of this that nobody read. */
  onProblem: (message: string) => void
}) {
  const session = useMidiSession()
  const { file, fileName, name, storedId, trouble, chosen, bpm, soloed, muted, playing } = session
  const [picking, setPicking] = useState<MidiChannel | null>(null)
  const [saving, setSaving] = useState(false)
  const [browsing, setBrowsing] = useState(false)

  const opening = useRef<HTMLInputElement>(null)

  const open = useCallback(async (picked: File) => {
    const bytes = new Uint8Array(await picked.arrayBuffer())
    try {
      holdMidiFile(readMidiFile(bytes), picked.name, bytes)
    } catch (error) {
      holdMidiTrouble(
        picked.name,
        error instanceof MidiFileError ? error.message : `That file could not be read: ${String(error)}`,
      )
    }
  }, [])

  const save = useCallback(
    (as: string) => {
      setSaving(false)
      void (async () => {
        const input = toInput({ ...session, name: as })
        if (!input) return
        try {
          /* Written back over the one that was opened, and created otherwise —
             only the server mints an id, which is what stops a save becoming a
             second copy every time. */
          const stored = storedId
            ? await desk.save(storedId, input)
            : await desk.create(input)
          markArrangementStored(stored.id, stored.name)
        } catch (error) {
          onProblem(error instanceof Error ? error.message : 'That did not save.')
        }
      })()
    },
    [desk, onProblem, session, storedId],
  )

  const reopen = useCallback(
    (arrangement: ArrangementSummary) => {
      setBrowsing(false)
      void (async () => {
        try {
          const { missing } = await openArrangement(desk, arrangement.id)
          /* A part whose sound has been deleted plays nothing, and the file
             otherwise opens looking complete, so this one is worth saying. */
          if (missing.length > 0) {
            onProblem(
              `“${arrangement.name}” opened, but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} gone, so those parts are silent`,
            )
          }
        } catch (error) {
          onProblem(error instanceof Error ? error.message : 'That did not open.')
        }
      })()
    },
    [desk, onProblem],
  )

  const discard = useCallback(
    async (arrangement: ArrangementSummary) => {
      try {
        await desk.remove(arrangement.id)
      } catch (error) {
        onProblem(error instanceof Error ? error.message : 'That did not delete.')
      }
    },
    [desk, onProblem],
  )

  const choose = useCallback(
    (part: MidiChannel, entry: LibraryEntry) => {
      setPicking(null)
      void (async () => {
        const patch = await loadPatch(entry)
        if (!patch) return
        chooseSound(part.channel, { entryId: entry.id, name: entry.name, patch })
      })()
    },
    [loadPatch],
  )

  const dressed = dressedParts(session)

  return (
    <Stack className={styles.page}>
      <Paper variant="outlined" className={styles.card}>
        <Box className={styles.head}>
          <Typography component="h2" className={styles.title}>
            {fileName || 'Play a MIDI file'}
          </Typography>

          {file && (
            <>
              <TextField
                size="small"
                value={bpm}
                label="Tempo"
                onChange={(event) => setTempo(event.target.value)}
                className={styles.tempo}
                slotProps={{ htmlInput: { 'aria-label': 'Tempo in beats per minute' } }}
              />
              <Typography component="span" color="text.secondary" className={styles.note}>
                {`file says ${file.bpm}`}
                {file.tempoChanges > 0 ? `, and changes ${file.tempoChanges} time(s)` : ''}
              </Typography>
            </>
          )}

          <Box className={styles.actions}>
            <Button
              className={styles.action}
              onClick={() => opening.current?.click()}
              sx={{
                color: TONE_COLOURS.blue.ink,
                backgroundColor: TONE_COLOURS.blue.field,
                '&:hover': { backgroundColor: TONE_COLOURS.blue.strong },
              }}
            >
              Upload
            </Button>

            {/* Hidden without the privilege rather than disabled: a button that
                is not for you reads as broken when it is greyed out. The routes
                behind both of these refuse regardless. */}
            <Can privilege={PRIVILEGE.StoreMidi}>
              <Button
                className={styles.action}
                onClick={() => setBrowsing(true)}
                sx={{
                  color: TONE_COLOURS.blue.ink,
                  backgroundColor: TONE_COLOURS.blue.field,
                  '&:hover': { backgroundColor: TONE_COLOURS.blue.strong },
                }}
              >
                Open
              </Button>
              <Button
                className={styles.action}
                /* Nothing to keep until there is a file. A file with no sounds
                   on it yet is still worth saving: the tempo and the parts are
                   the work, and the sounds come next. */
                disabled={!file}
                onClick={() => setSaving(true)}
                sx={{
                  color: TONE_COLOURS.amber.ink,
                  backgroundColor: TONE_COLOURS.amber.field,
                  '&:hover': { backgroundColor: TONE_COLOURS.amber.strong },
                }}
              >
                Save
              </Button>
            </Can>

            {playing ? (
              <Button
                className={styles.action}
                onClick={stopMidi}
                sx={{
                  color: TONE_COLOURS.pink.ink,
                  backgroundColor: TONE_COLOURS.pink.field,
                  '&:hover': { backgroundColor: TONE_COLOURS.pink.strong },
                }}
              >
                Stop
              </Button>
            ) : (
              <Button
                className={styles.action}
                disabled={dressed.length === 0}
                onClick={playMidi}
                sx={{
                  color: TONE_COLOURS.green.ink,
                  backgroundColor: TONE_COLOURS.green.field,
                  '&:hover': { backgroundColor: TONE_COLOURS.green.strong },
                }}
              >
                Play
              </Button>
            )}
          </Box>
        </Box>

        {trouble && (
          <Typography color="text.secondary" className={styles.trouble}>
            {trouble}
          </Typography>
        )}

        {!file && !trouble && (
          <Typography color="text.secondary" className={styles.trouble}>
            Upload a file and every channel in it becomes a part you can give a sound to.
          </Typography>
        )}
      </Paper>

      {file && file.channels.length > 0 && (
        <Paper variant="outlined" className={styles.card}>
          <Box component="ul" className={styles.parts}>
            {file.channels.map((part) => {
              const held = chosen[part.channel]
              /* Dimmed for a part that has a sound and will not be heard, which
                 is the only way to see why a part nobody muted has gone quiet
                 under somebody else's solo. */
              const quiet = held !== undefined && !isAudible(session, part.channel)
              return (
                <Box
                  component="li"
                  key={part.channel}
                  className={`${styles.part}${quiet ? ` ${styles.quiet}` : ''}`}
                >
                  <Typography component="span" color="text.secondary" className={styles.channel}>
                    {String(part.channel).padStart(2, '0')}
                  </Typography>

                  <Box className={styles.flags}>
                    <Flag
                      letter="S"
                      title={`Solo ${partName(part)}`}
                      tone="amber"
                      ink={SHELL.onTone}
                      on={soloed.has(part.channel)}
                      onPress={() => toggleSolo(part.channel)}
                    />
                    <Flag
                      letter="M"
                      title={`Mute ${partName(part)}`}
                      tone="pink"
                      ink={SHELL.onTone}
                      on={muted.has(part.channel)}
                      onPress={() => toggleMute(part.channel)}
                    />
                  </Box>

                  <Typography component="span" className={styles.name}>
                    {partName(part)}
                  </Typography>

                  <Box className={styles.marks}>
                    <ToneChip label={`${part.notes} notes`} tone="grey" />
                    {/* The tenth channel is where a file puts its drums, and a
                        Model D has no drums: its notes will play as pitches. */}
                    {part.channel === PERCUSSION_CHANNEL && (
                      <ToneChip label="percussion" tone="amber" />
                    )}
                  </Box>

                  <Box className={styles.sound}>
                    {held ? (
                      <ToneChip label={held.name} tone="green" />
                    ) : (
                      <Typography component="span" color="text.secondary" className={styles.silent}>
                        silent
                      </Typography>
                    )}
                  </Box>

                  <Button
                    size="small"
                    className={styles.choose}
                    onClick={() => setPicking(part)}
                    sx={{ color: TONE_COLOURS.blue.ink }}
                  >
                    {held ? 'Change' : 'Load patch'}
                  </Button>
                </Box>
              )
            })}
          </Box>
        </Paper>
      )}

      <PatchPicker
        open={picking !== null}
        forPart={picking ? partName(picking) : ''}
        entries={entries}
        onPick={(entry) => picking && choose(picking, entry)}
        onCancel={() => setPicking(null)}
      />

      <SaveArrangementDialog
        open={saving}
        name={name || fileName}
        overwriting={storedId !== null}
        onSave={save}
        onCancel={() => setSaving(false)}
      />

      <ArrangementPicker
        open={browsing}
        load={desk.list}
        onOpen={reopen}
        onRemove={discard}
        onCancel={() => setBrowsing(false)}
      />

      {/* Out of the flow: Upload clicks this. */}
      <input
        type="file"
        accept=".mid,.midi,audio/midi"
        hidden
        ref={opening}
        onChange={(event) => {
          const picked = event.target.files?.[0]
          event.target.value = ''
          if (picked) void open(picked)
        }}
      />
    </Stack>
  )
}
