import { useMemo } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Signature } from './Signature.tsx'
import { factsOf, figuresOf, shelfOf } from './stats.ts'
import { RouteGlyph } from '@components/railIcons.tsx'
import { StarRating } from '@components/library/StarRating.tsx'
import { ToneChip } from '@components/library/ToneChip.tsx'
import { bankOf, BANK_TONES, type LibraryEntry } from '@components/library/entry.ts'
import { SILENT } from '@audio/settings.ts'
import { panelRegistry } from '@controls/panel.ts'
import { pathFor, RAIL } from '@navigation/routes.ts'
import { tagColour, type TagPalette } from '@/tones.ts'
import styles from './HomePage.module.css'

/* What the last row is called to whoever owns it; the library's own words for
   the same three banks. */
const BANK_LABELS = { factory: 'Factory', user: 'Yours', custom: 'Shared' } as const

/* A line under each door, written here rather than in the route table: the
   table is read by the router and by tests with no DOM, and page copy in it
   would be one more thing a new route has to carry. A rail entry with nothing
   here still gets its card, without the line. */
const BLURB: Readonly<Record<string, string>> = {
  editor: 'The whole panel, full size. Turn anything and it sounds as you turn it.',
  library: 'Search it, narrow it by tag or bank, and rate what is worth coming back to.',
  midi: 'Load a MIDI file, give each part a patch, and hear the arrangement play.',
}

/* What the panel is, worked out once at module scope: both halves are fixed by
   the build, and a control that stops sounding is added to SILENT rather than
   to a number written here. */
const PANEL = {
  controls: panelRegistry.controls.length,
  audible: panelRegistry.controls.length - Object.keys(SILENT).length,
}

/* Four at a time. A fifth card wraps to a row of its own on every width this
   page is laid out for, which reads as a list that ran out rather than a shelf. */
const SHELF = 4

export function HomePage({
  entries,
  tagPalette = {},
  onNavigate,
  onOpen,
}: {
  entries: readonly LibraryEntry[]
  tagPalette?: TagPalette
  onNavigate: (path: string) => void
  /* The same thing pressing a library row does, so a patch reached from here
     arrives in the editor copied or writable by the same rules. */
  onOpen: (entry: LibraryEntry) => void
}) {
  const facts = useMemo(() => factsOf(entries, PANEL), [entries])
  const figures = useMemo(() => figuresOf(facts), [facts])
  const shelf = useMemo(() => shelfOf(entries, SHELF), [entries])

  return (
    <Box component="section" className={styles.page}>
      <Box className={styles.hero}>
        <Box className={styles.heroText}>
          <Typography className={styles.eyebrow}>Minimoog Model D</Typography>
          <Typography component="h2" className={styles.headline}>
            Every knob, remembered.
          </Typography>
          <Typography className={styles.standfirst}>
            Every control on the panel holds a value, and a patch is that set of values. Load one of
            the factory sheets, turn what you like, and keep it as your own.
          </Typography>

          <Box className={styles.actions}>
            <ButtonBase className={styles.primary} onClick={() => onNavigate(pathFor('editor'))}>
              Open the editor
            </ButtonBase>
            <ButtonBase className={styles.secondary} onClick={() => onNavigate(pathFor('library'))}>
              Browse the library
            </ButtonBase>
          </Box>
        </Box>

        <Box className={styles.heroArt}>
          <Signature />
        </Box>
      </Box>

      <Box component="dl" className={styles.figures}>
        {figures.map((figure) => (
          <Box key={figure.kicker} className={styles.figure}>
            <Typography component="dt" className={styles.kicker}>
              {figure.kicker}
            </Typography>
            <Typography
              component="dd"
              className={figure.value === null ? styles.blank : styles.value}
            >
              {figure.value ?? '—'}
            </Typography>
            <Typography className={styles.caption}>{figure.caption}</Typography>
          </Box>
        ))}
      </Box>

      {shelf.entries.length > 0 && (
        <Stack spacing={2}>
          <Typography component="h3" className={styles.blockTitle}>
            {shelf.title}
          </Typography>
          <Box className={styles.shelf}>
            {shelf.entries.map((entry) => (
              <PatchCard
                key={entry.id}
                entry={entry}
                tagPalette={tagPalette}
                onOpen={() => onOpen(entry)}
              />
            ))}
          </Box>
        </Stack>
      )}

      <Stack spacing={2}>
        <Typography component="h3" className={styles.blockTitle}>
          Everywhere else
        </Typography>
        <Box className={styles.shelf}>
          {RAIL.map((route) => (
            <ButtonBase
              key={route.name}
              className={styles.door}
              onClick={() => onNavigate(route.path)}
            >
              <Box className={styles.cardBody}>
                <Box className={styles.doorGlyph}>
                  <RouteGlyph route={route.name} />
                </Box>
                <Typography component="span" className={styles.doorTitle}>
                  {route.title}
                </Typography>
                <Typography component="span" className={styles.doorBlurb}>
                  {BLURB[route.name] ?? ''}
                </Typography>
              </Box>
            </ButtonBase>
          ))}
        </Box>
      </Stack>
    </Box>
  )
}

/* The stars are read-only here: rating is something you do to a patch you are
   looking at, and this card is a way past it rather than a row in the library. */
function PatchCard({
  entry,
  tagPalette,
  onOpen,
}: {
  entry: LibraryEntry
  tagPalette: TagPalette
  onOpen: () => void
}) {
  const bank = bankOf(entry)
  const name = entry.name || '(unnamed)'

  return (
    <ButtonBase
      className={styles.patch}
      onClick={onOpen}
      aria-label={`Open ${name} in the editor`}
    >
      <Box className={styles.cardBody}>
        <Box className={styles.patchHead}>
          <ToneChip label={BANK_LABELS[bank]} tone={BANK_TONES[bank]} />
          {/* Five empty stars hold a column in the library, where every row has
              them. Four cards in a row do not have a column to hold, and the
              empty set was the loudest thing on an unrated card. */}
          {(entry.rating ?? entry.averageRating) !== null && (
            <StarRating rating={entry.rating} average={entry.averageRating} subject={name} />
          )}
        </Box>

        <Typography component="span" className={styles.patchName}>
          {name}
        </Typography>

        <Box className={styles.patchTags}>
          {entry.tags.slice(0, 3).map((tag) => (
            <ToneChip key={tag} label={tag} tone={tagColour(tagPalette, tag)} />
          ))}
        </Box>
      </Box>
    </ButtonBase>
  )
}
