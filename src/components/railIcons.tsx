/* The rail's glyphs, from the exports in `reference/`. The paths are the
   designer's verbatim; the only edit is the fill, which was a literal grey in
   every file and is `currentColor` here so one rule in the stylesheet lights
   the row you are standing on.

   Inline components rather than `*.svg?react` imports: svgr runs in Vite and
   not in Bun, so an imported file would be a component the suite cannot render
   — and these are drawn by the one part of the app that has no other way to be
   tested. Each keeps its export's own proportions and is scaled to a common
   24px height, which is what makes a narrow glyph sit beside a wide one without
   either being redrawn. */

export function HomeGlyph() {
  return (
    <svg viewBox="0 0 26 26" width="24" height="24" aria-hidden="true" focusable="false">
      <path
        d="M9.78804 1.36601C11.3817 -0.455303 14.215 -0.455299 15.8086 1.36601L25.3472 12.2672C25.9129 12.9137 25.4537 13.9257 24.5946 13.9257H23.7983C23.2461 13.9257 22.7983 14.3734 22.7983 14.9257V24.9257C22.7983 25.4779 22.3506 25.9257 21.7983 25.9257H16.7983C16.2461 25.9257 15.7983 25.4779 15.7983 24.9257V18.9257C15.7983 18.3734 15.3506 17.9257 14.7983 17.9257H10.7983C10.2461 17.9257 9.79834 18.3734 9.79834 18.9257V24.9257C9.79834 25.4779 9.35062 25.9257 8.79834 25.9257H3.79834C3.24606 25.9257 2.79834 25.4779 2.79834 24.9257V14.9257C2.79834 14.3734 2.35062 13.9257 1.79834 13.9257H1.00211C0.142949 13.9257 -0.316229 12.9137 0.249531 12.2672L9.78804 1.36601Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function LibraryGlyph() {
  return (
    <svg viewBox="0 0 22 28" width="19" height="24" aria-hidden="true" focusable="false">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 4C0 1.79086 1.79086 0 4 0H18C20.2091 0 22 1.79086 22 4V24C22 26.2091 20.2091 28 18 28H4C1.79086 28 0 26.2091 0 24V4ZM17 3H5C3.89543 3 3 3.89543 3 5C3 6.10457 3.89543 7 5 7H17C18.1046 7 19 6.10457 19 5C19 3.89543 18.1046 3 17 3ZM17 9H5C3.89543 9 3 9.89543 3 11C3 12.1046 3.89543 13 5 13H17C18.1046 13 19 12.1046 19 11C19 9.89543 18.1046 9 17 9ZM17 15H5C3.89543 15 3 15.8954 3 17C3 18.1046 3.89543 19 5 19H17C18.1046 19 19 18.1046 19 17C19 15.8954 18.1046 15 17 15ZM17 21H5C3.89543 21 3 21.8954 3 23C3 24.1046 3.89543 25 5 25H17C18.1046 25 19 24.1046 19 23C19 21.8954 18.1046 21 17 21Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function EditorGlyph() {
  return (
    <svg viewBox="0 0 24 28" width="21" height="24" aria-hidden="true" focusable="false">
      <path
        d="M0 14C0 12.8954 0.895431 12 2 12H7C8.10457 12 9 12.8954 9 14C9 15.1046 8.10457 16 7 16H2C0.895431 16 0 15.1046 0 14Z"
        fill="currentColor"
      />
      <path
        d="M15 23C15 21.8954 15.8954 21 17 21H22C23.1046 21 24 21.8954 24 23C24 24.1046 23.1046 25 22 25H17C15.8954 25 15 24.1046 15 23Z"
        fill="currentColor"
      />
      <path
        d="M15 5C15 3.89543 15.8954 3 17 3H22C23.1046 3 24 3.89543 24 5C24 6.10457 23.1046 7 22 7H17C15.8954 7 15 6.10457 15 5Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13 5C13 7.76142 10.7614 10 8 10C5.94968 10 4.1876 8.7659 3.41604 7H2C0.895431 7 0 6.10457 0 5C0 3.89543 0.895431 3 2 3H3.41604C4.1876 1.2341 5.94968 0 8 0C10.7614 0 13 2.23858 13 5ZM8 8C9.65685 8 11 6.65685 11 5C11 3.34315 9.65685 2 8 2C6.34315 2 5 3.34315 5 5C5 6.65685 6.34315 8 8 8Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11 14C11 16.7614 13.2386 19 16 19C18.0503 19 19.8124 17.7659 20.584 16H22C23.1046 16 24 15.1046 24 14C24 12.8954 23.1046 12 22 12H20.584C19.8124 10.2341 18.0503 9 16 9C13.2386 9 11 11.2386 11 14ZM16 17C14.3431 17 13 15.6569 13 14C13 12.3431 14.3431 11 16 11C17.6569 11 19 12.3431 19 14C19 15.6569 17.6569 17 16 17Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13 23C13 25.7614 10.7614 28 8 28C5.94968 28 4.1876 26.7659 3.41604 25H2C0.895431 25 0 24.1046 0 23C0 21.8954 0.895431 21 2 21H3.41604C4.1876 19.2341 5.94968 18 8 18C10.7614 18 13 20.2386 13 23ZM8 26C9.65685 26 11 24.6569 11 23C11 21.3431 9.65685 20 8 20C6.34315 20 5 21.3431 5 23C5 24.6569 6.34315 26 8 26Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function PlayGlyph() {
  return (
    <svg viewBox="0 0 22 28" width="19" height="24" aria-hidden="true" focusable="false">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 4C0 1.79086 1.79086 0 4 0H18C20.2091 0 22 1.79086 22 4V24C22 26.2091 20.2091 28 18 28H4C1.79086 28 0 26.2091 0 24V4ZM17.6161 14.8517C18.2506 14.4612 18.2506 13.5388 17.6161 13.1483L7.5241 6.93791C6.85783 6.52789 6 7.00724 6 7.78956V20.2104C6 20.9928 6.85783 21.4721 7.5241 21.0621L17.6161 14.8517Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function SettingsGlyph() {
  return (
    <svg viewBox="0 0 28 28" width="24" height="24" aria-hidden="true" focusable="false">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M23.5755 24.2235C22.7116 25.0874 21.3109 25.0874 20.4469 24.2235C19.0533 22.8298 16.6704 23.8169 16.6704 25.7878C16.6704 27.0095 15.68 28 14.4582 28H13.5418C12.32 28 11.3296 27.0095 11.3296 25.7878C11.3296 23.8169 8.94669 22.8298 7.55306 24.2235C6.68913 25.0874 5.28841 25.0874 4.42448 24.2235L3.77653 23.5755C2.9126 22.7116 2.9126 21.3109 3.77653 20.4469C5.17016 19.0533 4.18313 16.6704 2.21224 16.6704C0.990454 16.6704 0 15.68 0 14.4582V13.5418C0 12.32 0.990454 11.3296 2.21224 11.3296C4.18313 11.3296 5.17016 8.94669 3.77653 7.55306C2.9126 6.68913 2.9126 5.28841 3.77653 4.42448L4.42448 3.77653C5.28841 2.9126 6.68913 2.9126 7.55306 3.77653C8.94669 5.17016 11.3296 4.18314 11.3296 2.21224C11.3296 0.990454 12.32 0 13.5418 0H14.4582C15.68 0 16.6704 0.990454 16.6704 2.21224C16.6704 4.18313 19.0533 5.17016 20.4469 3.77653C21.3109 2.9126 22.7116 2.9126 23.5755 3.77653L24.2235 4.42448C25.0874 5.28841 25.0874 6.68913 24.2235 7.55306C22.8298 8.94669 23.8169 11.3296 25.7878 11.3296C27.0095 11.3296 28 12.32 28 13.5418V14.4582C28 15.68 27.0095 16.6704 25.7878 16.6704C23.8169 16.6704 22.8298 19.0533 24.2235 20.4469C25.0874 21.3109 25.0874 22.7116 24.2235 23.5755L23.5755 24.2235ZM14 19.8333C17.2217 19.8333 19.8333 17.2217 19.8333 14C19.8333 10.7783 17.2217 8.16667 14 8.16667C10.7783 8.16667 8.16667 10.7783 8.16667 14C8.16667 17.2217 10.7783 19.8333 14 19.8333Z"
        fill="currentColor"
      />
    </svg>
  )
}

/* A head and a pair of shoulders, for the account. Drawn here rather than
   exported with the rest: the set has no glyph for it. */
export function AccountGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path
        d="M5 19.5c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* The double chevron that folds the rail away. It points left in the export and
   is turned by the stylesheet when the rail is already folded, so there is one
   shape rather than a mirrored pair to keep in step. */
export function CollapseGlyph() {
  return (
    <svg viewBox="0 0 13 12" width="13" height="12" aria-hidden="true" focusable="false">
      <path
        d="M0.302532 6.70694C-0.100845 6.31651 -0.100844 5.68349 0.302533 5.29306L5.5557 0.208475C6.01581 -0.236872 6.80253 0.0785421 6.80253 0.708358C6.80253 0.89585 6.72558 1.07566 6.58861 1.20824L1.63798 6L6.58861 10.7918C6.72558 10.9243 6.80253 11.1042 6.80253 11.2916C6.80253 11.9215 6.01581 12.2369 5.5557 11.7915L0.302532 6.70694Z"
        fill="currentColor"
      />
      <path
        d="M6.5 6.70694C6.09662 6.31651 6.09662 5.68349 6.5 5.29306L11.7532 0.208475C12.2133 -0.236872 13 0.0785421 13 0.708358C13 0.89585 12.923 1.07566 12.7861 1.20824L7.83544 6L12.7861 10.7918C12.923 10.9243 13 11.1042 13 11.2916C13 11.9215 12.2133 12.2369 11.7532 11.7915L6.5 6.70694Z"
        fill="currentColor"
      />
    </svg>
  )
}
