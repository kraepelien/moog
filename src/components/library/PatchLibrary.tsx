import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Pagination from '@mui/material/Pagination'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { FilterRow, type FilterChoice } from './FilterRow.tsx'
import { PatchRow } from './PatchRow.tsx'
import { SearchField } from './SearchField.tsx'
import {
  matchesFilters,
  toggled,
  NO_FILTERS,
  type LibraryEntry,
  type LibraryFilters,
} from './entry.ts'
import { instrumentName } from '../../instruments/instruments.ts'
import { toneForTag } from '../../tones.ts'
import styles from './PatchLibrary.module.css'

/* A page is long because the list is one line per patch and scrolling is cheaper
   than paging; the point of a limit is that a bank of thousands does not build
   thousands of rows at once. */
export const PER_PAGE = 100

/* The filter rows are built from what is actually in the library rather than
   from a fixed list, so a tag nobody uses never offers itself and a tag added
   to a patch appears without anything here being edited. */
function choicesFrom(entries: readonly LibraryEntry[]): {
  tags: FilterChoice[]
  instruments: FilterChoice[]
} {
  const tags = new Set<string>()
  const instruments = new Set<string>()
  for (const entry of entries) {
    for (const tag of entry.tags ?? []) tags.add(tag)
    if (entry.instrument !== null) instruments.add(entry.instrument)
  }
  return {
    tags: [...tags].sort().map((tag) => ({ value: tag, label: tag, tone: toneForTag(tag) })),
    instruments: [...instruments]
      .sort()
      .map((id) => ({ value: id, label: instrumentName(id), tone: 'green' as const })),
  }
}

const ORIGIN_CHOICES: readonly FilterChoice[] = [
  { value: 'factory', label: 'Factory', tone: 'pink' },
  { value: 'user', label: 'User', tone: 'violet' },
  { value: 'public', label: 'Public', tone: 'blue' },
]

export function PatchLibrary({
  entries,
  onOpen,
}: {
  entries: readonly LibraryEntry[]
  /* Picking a patch opens it in the editor, so the library holds no selection of
     its own and nothing here has to be told when the editor loads something. */
  onOpen: (entry: LibraryEntry) => void
}) {
  const [filters, setFilters] = useState<LibraryFilters>(NO_FILTERS)
  const [wantedPage, setPage] = useState(1)

  const choices = useMemo(() => choicesFrom(entries), [entries])
  const shown = useMemo(
    () => entries.filter((entry) => matchesFilters(entry, filters)),
    [entries, filters],
  )

  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE))
  /* Narrowing the filters can leave the wanted page past the end. Clamped as it
     renders rather than corrected afterwards, which would draw the empty page
     once before putting it right. */
  const page = Math.min(wantedPage, pages)

  const start = (page - 1) * PER_PAGE
  const visible = shown.slice(start, start + PER_PAGE)

  const change = (next: LibraryFilters) => {
    setFilters(next)
    setPage(1)
  }

  return (
    <Stack className={styles.library}>
      <Paper variant="outlined" className={styles.card}>
        <Box className={styles.search}>
          <SearchField
            value={filters.text}
            onChange={(text) => change({ ...filters, text })}
            placeholder="Search for names, categories, synths or stars"
          />
        </Box>

        <Stack className={styles.filters}>
          <FilterRow
            label="Category"
            choices={choices.tags}
            selected={filters.tags}
            onToggle={(tag) => change({ ...filters, tags: toggled(filters.tags, tag) })}
          />
          <FilterRow
            label="Synth"
            choices={choices.instruments}
            selected={filters.instruments}
            onToggle={(id) => change({ ...filters, instruments: toggled(filters.instruments, id) })}
          />
          <FilterRow
            label="Other"
            choices={ORIGIN_CHOICES}
            selected={[...filters.origins, ...(filters.publicOnly ? ['public'] : [])]}
            onToggle={(value) => {
              if (value === 'public') {
                change({ ...filters, publicOnly: !filters.publicOnly })
                return
              }
              change({ ...filters, origins: toggled(filters.origins, value as 'factory' | 'user') })
            }}
          />
        </Stack>
      </Paper>

      <Paper variant="outlined" className={styles.card}>
        <Box className={styles.count}>
          <Typography component="h2" color="text.secondary" className={styles.countText}>
            {shown.length === entries.length
              ? `${entries.length} patches`
              : `${shown.length} of ${entries.length} patches`}
          </Typography>
        </Box>

        <Box component="ul" className={styles.rows}>
          {visible.map((entry, index) => (
            <PatchRow
              key={`${entry.origin}-${entry.id}`}
              entry={entry}
              index={start + index}
              onOpen={() => onOpen(entry)}
            />
          ))}
        </Box>

        {shown.length === 0 && (
          <Typography color="text.secondary" className={styles.empty}>
            Nothing matches. Clear the search, or switch a chip off.
          </Typography>
        )}

        {pages > 1 && (
          <Box className={styles.pager}>
            <Pagination
              count={pages}
              page={page}
              onChange={(_event, next) => setPage(next)}
              size="small"
              shape="rounded"
              aria-label="Library pages"
            />
          </Box>
        )}
      </Paper>
    </Stack>
  )
}
