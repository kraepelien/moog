import { useRef } from 'react'
import Rating from '@mui/material/Rating'
import { MAX_STARS, RATING_STEP } from './entry.ts'
import { SHELL, TONE_COLOURS } from '../../tones.ts'

/* One set of stars showing two numbers, which is the whole design: amber is
   everyone's average, blue is what I gave it. Two widgets side by side would
   ask a reader to work out which of them they can press. The numeric average
   stays printed beside either, so my stars never hide it.

   An unrated patch draws five empty stars rather than nothing: the column is
   part of the layout whether or not anything has been rated. */
export function StarRating({
  rating,
  average,
  subject,
  onRate,
}: {
  /* Mine, and null when I have not rated it. */
  rating: number | null
  average: number | null
  subject: string
  onRate?: (stars: number) => void
}) {
  const mine = rating !== null

  /* MUI reports a click on the value already shown as a clear, and does not say
     which star was hit. Clearing is right for a rating of mine — 0 means
     unrated, not bad — but while the stars show the average, the star under the
     average is the one click that would be swallowed instead of setting it. */
  const hovered = useRef(0)

  return (
    <Rating
      value={(mine ? rating : average) ?? 0}
      max={MAX_STARS}
      precision={RATING_STEP}
      readOnly={onRate === undefined}
      size="small"
      /* Which of the two numbers is on the stars is a colour, and a colour is
         not readable aloud. */
      aria-label={mine ? `Your rating for ${subject}` : `Average rating for ${subject}`}
      onChangeActive={(_event, active) => {
        if (active !== -1) hovered.current = active
      }}
      onChange={(event, next) => {
        /* The row is a button; a click on a star is not a click on the row. */
        event.stopPropagation()
        onRate?.(next ?? (mine ? 0 : hovered.current))
      }}
      onClick={(event) => event.stopPropagation()}
      sx={{
        '& .MuiRating-iconFilled': { color: mine ? TONE_COLOURS.blue.ink : SHELL.star },
        '& .MuiRating-iconEmpty': { color: 'rgb(255 255 255 / 18%)' },
      }}
    />
  )
}
