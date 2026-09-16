import Rating from '@mui/material/Rating'
import { SHELL } from '../../tones.ts'

/* An unrated patch draws five empty stars rather than nothing: the column is
   part of the layout whether or not anything has been rated. Clicking the star
   already set clears the rating, which is what 0 means — unrated, not bad. */
export function StarRating({
  value,
  label,
  onRate,
}: {
  value: number | null
  label: string
  onRate?: (stars: number) => void
}) {
  return (
    <Rating
      value={value ?? 0}
      max={5}
      readOnly={onRate === undefined}
      size="small"
      aria-label={label}
      onChange={(event, next) => {
        /* The row is a button; a click on a star is not a click on the row. */
        event.stopPropagation()
        onRate?.(next ?? 0)
      }}
      onClick={(event) => event.stopPropagation()}
      sx={{
        '& .MuiRating-iconFilled': { color: SHELL.star },
        '& .MuiRating-iconEmpty': { color: 'rgb(255 255 255 / 18%)' },
      }}
    />
  )
}
