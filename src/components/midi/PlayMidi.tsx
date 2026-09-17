import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { PatchPicker } from './PatchPicker.tsx'
import { ToneChip } from '../library/ToneChip.tsx'
import type { LibraryEntry } from '../library/entry.ts'
import { MidiFileError, readMidiFile, type MidiChannel, type MidiFile } from '../../audio/midiFile.ts'
import { createMidiPlayer, type MidiPlayer, type PlayerVoice } from '../../audio/midiPlayer.ts'
import { settingsFrom } from '../../audio/settings.ts'
import { silenceVoices, voiceFor } from '../../audio/voices.ts'
import { panelRegistry } from '../../controls/panel.ts'
import { resolvePatch } from '../../patch/resolve.ts'
import type { Patch } from '../../patch/schema.ts'
import { TONE_COLOURS } from '../../tones.ts'
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
 */

export interface Chosen {
  readonly entryId: string
  readonly name: string
  readonly patch: Patch
}

const PERCUSSION_CHANNEL = 10

function partName(part: MidiChannel): string {
  return part.name ?? `Channel ${part.channel}`
}

export function PlayMidi({
  entries,
  loadPatch,
}: {
  entries: readonly LibraryEntry[]
  /* The library holds summaries; playing needs the values, so the page that has
     a store hands this down rather than this one reaching for it. */
  loadPatch: (entry: LibraryEntry) => Promise<Patch | null>
}) {
  const [file, setFile] = useState<MidiFile | null>(null)
  const [fileName, setFileName] = useState('')
  const [trouble, setTrouble] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Record<number, Chosen>>({})
  const [picking, setPicking] = useState<MidiChannel | null>(null)
  const [bpm, setBpm] = useState('')
  const [playing, setPlaying] = useState(false)

  const opening = useRef<HTMLInputElement>(null)
  const player = useRef<MidiPlayer | null>(null)

  /* Leaving the page mid-file must not leave a note sounding. */
  useEffect(
    () => () => {
      player.current?.stop()
      silenceVoices()
    },
    [],
  )

  const open = useCallback(async (picked: File) => {
    player.current?.stop()
    setPlaying(false)
    try {
      const read = readMidiFile(new Uint8Array(await picked.arrayBuffer()))
      setFile(read)
      setFileName(picked.name)
      setBpm(String(read.bpm))
      setChosen({})
      setTrouble(read.channels.length === 0 ? 'That file has no notes in it.' : null)
    } catch (error) {
      setFile(null)
      setFileName(picked.name)
      setTrouble(
        error instanceof MidiFileError ? error.message : `That file could not be read: ${String(error)}`,
      )
    }
  }, [])

  const choose = useCallback(
    (part: MidiChannel, entry: LibraryEntry) => {
      setPicking(null)
      void (async () => {
        const patch = await loadPatch(entry)
        if (!patch) return
        setChosen((held) => ({
          ...held,
          [part.channel]: { entryId: entry.id, name: entry.name, patch },
        }))
      })()
    },
    [loadPatch],
  )

  const dressed = useMemo(
    () => (file?.channels ?? []).filter((part) => chosen[part.channel] !== undefined),
    [file, chosen],
  )

  /* The file's own tempo is what its seconds were worked out against, so playing
     it at another one is a ratio rather than a rewrite. */
  const rate = useMemo(() => {
    const wanted = Number(bpm)
    if (!file || !Number.isFinite(wanted) || wanted <= 0) return 1
    return wanted / file.bpm
  }, [bpm, file])

  const stop = useCallback(() => {
    player.current?.stop()
    player.current = null
    silenceVoices()
    setPlaying(false)
  }, [])

  const play = useCallback(() => {
    if (!file || dressed.length === 0) return

    const voices: PlayerVoice[] = dressed.map((part) => {
      const instrument = voiceFor(part.channel)
      /* Resolved rather than raw: a patch need not carry every control, and the
         ones it leaves out are the registry's defaults, which is what the panel
         would be showing. */
      const resolved = resolvePatch(panelRegistry, chosen[part.channel]!.patch)
      instrument.apply(settingsFrom(resolved.values))
      return { channel: part.channel, instrument, messages: part.messages }
    })

    const made = createMidiPlayer(voices)
    player.current = made
    made.subscribe(() => setPlaying(made.snapshot().playing))
    made.play(rate)
    setPlaying(true)
  }, [file, dressed, chosen, rate])

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
                onChange={(event) => setBpm(event.target.value)}
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
            {playing ? (
              <Button
                className={styles.action}
                onClick={stop}
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
                onClick={play}
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
              return (
                <Box component="li" key={part.channel} className={styles.part}>
                  <Typography component="span" color="text.secondary" className={styles.channel}>
                    {String(part.channel).padStart(2, '0')}
                  </Typography>

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
