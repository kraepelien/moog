import Rating from '@mui/material/Rating'
import { SHELL } from '../../tones.ts'

/* Nothing in the patch schema carries a rating yet, so `value` is nullable and
   an unrated patch draws five empty stars rather than nothing: the column is
   part of the layout whether or not anything has been rated.

   Read-only until there is somewhere to put a rating. Giving it an onChange now
   would offer a click that could not be saved. */
export function StarRating({ value, label }: { value: number | null; label: string }) {
  return (
    <Rating
      value={value ?? 0}
      max={5}
      readOnly
      size="small"
      aria-label={label}
      sx={{
        '& .MuiRating-iconFilled': { color: SHELL.star },
        '& .MuiRating-iconEmpty': { color: 'rgb(255 255 255 / 18%)' },
      }}
    />
  )
}
