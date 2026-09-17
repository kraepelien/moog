import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import { SHELL } from '@/tones.ts'

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="6.4" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M15.8 15.8 20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ClearGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/* The clear button keeps its place when there is nothing to clear, because a
   control that appears under the pointer as you type moves what is beside it. */
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <TextField
      fullWidth
      size="small"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      sx={{
        '& .MuiOutlinedInput-root': { backgroundColor: SHELL.field, borderRadius: '6px' },
        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
        '& .MuiInputAdornment-root': { color: 'text.secondary' },
      }}
      slotProps={{
        htmlInput: { 'aria-label': placeholder, type: 'search' },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchGlyph />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                size="small"
                color="inherit"
                aria-label="Clear the search"
                onClick={() => onChange('')}
                disabled={value === ''}
              >
                <ClearGlyph />
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  )
}
