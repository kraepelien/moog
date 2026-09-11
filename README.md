# Moog

Single-page React + TypeScript app, built with Vite.

Package manager is [Bun](https://bun.com).

```bash
bun install
bun run dev      # dev server on http://localhost:5173
bun run build    # typecheck + production build to dist/
bun run lint     # oxlint
bun run preview  # serve the production build
```

Vite still runs on Node by default. `bun --bun run dev` runs it on the Bun runtime instead —
faster to start, but not all Vite plugins are happy there, so it is opt-in per command.

## Layout

```
public/            static files served as-is (favicon)
src/
  assets/          images and SVGs (icons/ for icon-sized ones)
  components/      reusable components, one folder each
  layouts/         app shell
  styles/          reset.css + tokens.css (CSS custom properties)
  App.tsx          the page
  main.tsx         entry point
```

Components are folders — `Button/Button.tsx`, `Button/Button.module.css`, `Button/index.ts` —
so a component's styles sit next to it and imports stay `@/components/Button`.

`@/` is an alias for `src/` (set in both `vite.config.ts` and `tsconfig.app.json`).

## SVGs

`vite-plugin-svgr` turns an SVG into a React component when imported with `?react`:

```tsx
import ArrowRight from '@/assets/icons/arrow-right.svg?react'

<Icon svg={ArrowRight} size={16} />
```

Use `currentColor` for strokes and fills in the SVG source so icons inherit text color.
Importing without `?react` gives the URL instead, for `<img src=…>`.

## Styling

CSS Modules per component. Shared values — colors, spacing, radii — are CSS custom properties in
`src/styles/tokens.css`, including a `prefers-color-scheme: dark` block, so components reference
`var(--color-accent)` rather than literals.
