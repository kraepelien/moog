import { useCallback, useRef } from 'react'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { FieldRow } from '@components/library/FieldRow.tsx'
import { FilterRow } from '@components/library/FilterRow.tsx'
import { PatchNotes } from '@components/library/PatchNotes.tsx'
import { StarRating } from '@components/library/StarRating.tsx'
import { PatchBar } from '@components/PatchBar.tsx'
import { FitToWidth } from '@components/FitToWidth.tsx'
import { Panel } from '@components/Panel.tsx'
import { printableHeightPx, printableWidthPx } from '@components/printSheet.ts'
import { bankOf, BANK_TONES, type LibraryEntry } from '@components/library/entry.ts'
import { instrumentName } from '@instruments/instruments.ts'
import { panelRegistry } from '@controls/panel.ts'
import type { ControlValue } from '@controls/types.ts'
import { resolvePatch } from '@patch/resolve.ts'
import type { Patch } from '@patch/schema.ts'
import { tagColour, type TagPalette } from '@/tones.ts'
import styles from './PatchPage.module.css'

/* One patch at an address of its own, which is what makes a patch something you
   can send somebody. It shows rather than edits: arriving here changes nothing,
   so a link opened by somebody halfway through a patch of their own cannot cost
   them the draft they had going. Editing is the button, and that is the one act
   that asks about an unsaved draft.

   Everything here is drawn from the pieces the library and the save form use,
   because they are the same fields. */

const BANK_LABELS = { factory: 'Factory', user: 'Yours', custom: 'Shared' } as const

export function PatchPage({
  patch,
  loading,
  entry,
  played = {},
  tagPalette = {},
  onOpen,
  onBrowse,
  onPlay,
  onRate,
  /* Taken as a parameter with a default, the way the keyboard takes its
     instrument, so a test can count prints instead of opening a dialog it
     cannot close. Wrapped rather than passed bare: `print` detached from the
     window it belongs to throws when it is called. */
  onPrint = () => window.print(),
}: {
  patch: Patch | null
  loading: boolean
  /* The controls the patch does not record, which the sheet leaves live: the
     output levels, the sprung pitch wheel, and whatever the keyboard moves as
     it is played. Held by the app rather than here, so walking to the editor
     and back does not reset the volume somebody just set. */
  played?: Readonly<Record<string, ControlValue>>
  /* The library row for this patch, where the library holds one: it carries the
     ratings and who owns it, which the patch itself does not. A patch reached
     by a link to something outside your library still draws, without them. */
  entry: LibraryEntry | null
  tagPalette?: TagPalette
  onOpen: () => void
  onBrowse: () => void
  onPlay?: (id: string, value: ControlValue) => void
  onRate?: (stars: number) => void
  onPrint?: () => void
}) {
  const sheet = useRef<HTMLDivElement>(null)
  const drawing = useRef<HTMLDivElement>(null)

  /* How much of the page the panel may have, answered while the print is being
     set up rather than worked out in advance: it is the paper less everything
     else on the sheet, and a patch with three rows of chips and a long note
     leaves less of it than one with neither.

     Measured at the paper's width, because `beforeprint` runs on the layout the
     window has: the note that takes two lines in a 1680px window may take three
     across a page 1047px wide, and a sheet measured at the wrong width is a
     sheet that fits until somebody prints it from a large monitor. Setting the
     width forces the reflow, and it is put back before the handler returns, so
     nothing is ever painted at it. */
  const room = useCallback(() => {
    const width = printableWidthPx()
    const column = sheet.current
    const panel = drawing.current
    if (!column || !panel) return { width, height: printableHeightPx() }

    const was = column.style.width
    column.style.width = `${width}px`
    /* The panel's own box is taken back out, so the answer does not depend on
       the scale it happens to be drawn at while this is being asked. */
    const rest = column.getBoundingClientRect().height - panel.getBoundingClientRect().height
    column.style.width = was
    return { width, height: printableHeightPx() - rest }
  }, [])

  if (loading) return <Typography sx={{ p: 2 }}>Loading…</Typography>

  /* Unknown, somebody else's private one, and deleted are one message on
     purpose: the server refuses to tell them apart, because a 403 confirms that
     an id exists. Saying more here would invent a distinction it withheld. */
  if (patch === null) {
    return (
      <Alert severity="info" className={styles.absent} data-print="off">
        <AlertTitle>No patch at this address</AlertTitle>
        <Typography component="p" sx={{ mb: 1.5 }}>
          It may have been deleted, or it may belong to somebody who has not published it.
        </Typography>
        <Button variant="outlined" size="small" onClick={onBrowse}>
          Browse the library
        </Button>
      </Alert>
    )
  }

  const resolved = resolvePatch(panelRegistry, patch)
  const bank = entry === null ? null : bankOf(entry)

  return (
    <div className={styles.page} ref={sheet}>
      <PatchBar
        title={{ text: patch.name, unsaved: false }}
        buttons={[
          { label: 'Open in the editor', tone: 'green', onSelect: onOpen },
          { label: 'Print', tone: 'blue', onSelect: onPrint },
        ]}
      />

      <div className={styles.fields}>
        {patch.tags.length > 0 && (
          <FilterRow
            label="Category"
            choices={patch.tags.map((tag) => ({
              value: tag,
              label: tag,
              tone: tagColour(tagPalette, tag),
              locked: true,
            }))}
            selected={[]}
            onToggle={() => {}}
          />
        )}

        <FilterRow
          label="Synth"
          choices={[
            {
              value: patch.instrument,
              label: instrumentName(patch.instrument),
              tone: 'green',
              locked: true,
            },
          ]}
          selected={[]}
          onToggle={() => {}}
        />

        {bank !== null && (
          <FilterRow
            label="Other"
            choices={[
              { value: bank, label: BANK_LABELS[bank], tone: BANK_TONES[bank], locked: true },
              ...(patch.visibility === 'public'
                ? [{ value: 'public', label: 'Public', tone: 'amber' as const, locked: true }]
                : []),
            ]}
            selected={[]}
            onToggle={() => {}}
          />
        )}

        {entry !== null && (
          <FieldRow label="Rating">
            <StarRating
              rating={entry.rating}
              average={entry.averageRating}
              subject={patch.name}
              onRate={onRate}
            />
          </FieldRow>
        )}

        {/* Nothing else in the app says where a copy came from, and on the one
            page a patch has to itself it is worth a line. */}
        {patch.derivedFrom && (
          <FieldRow label="Copied from">
            <Typography component="span" className={styles.provenance}>
              {patch.derivedFrom.name}
              {patch.derivedFrom.ownerName ? ` (${patch.derivedFrom.ownerName})` : ''}
            </Typography>
          </FieldRow>
        )}
      </div>

      {/* Playable, which is the point of an interactive sheet rather than a
          picture of one: the keyboard carries its own audio, so drawing the
          panel is what makes a link somebody was sent sound. `readOnly` has
          already swallowed every write to a control the patch records, so
          anything arriving here is one of the controls it does not. */}
      <div data-print="panel" ref={drawing}>
        <FitToWidth printRoom={room}>
          <Panel
            registry={panelRegistry}
            values={{ ...resolved.values, ...played }}
            onChange={(id, next) => onPlay?.(id, next)}
            readOnly
          />
        </FitToWidth>
      </div>

      {/* Under the panel, which is where the manual's own sheets print theirs. */}
      <div className={styles.notes} data-print="notes">
        <PatchNotes notes={patch.notes} />
      </div>
    </div>
  )
}
