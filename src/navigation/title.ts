import { useEffect } from 'react'
import { useRoute } from './router.ts'
import { ADMIN_ROUTES, HOME_ROUTE, type RouteDef } from './routes.ts'

/* What `index.html` already carries, written out again rather than read back off
   the document: this is what writes the document's title, so reading it would
   name every page after the one visited before it.

   `test/title.test.ts` fails if the two copies drift apart. */
export const APP_NAME = 'PatchMemory'

/* The table's title is what the page is called to a reader, which is what a tab,
   a bookmark and a history entry all want; the app's name follows it so a row of
   tabs is legible at the width a tab actually has.

   The home page is the app, and naming it twice says nothing.

   An administrative page says so: "Layout" and "People" are generic enough to be
   any page of any app in a row of tabs, and the area they belong to is the thing
   a reader is missing. Taken from `ADMIN_ROUTES` rather than tested here, so
   what counts as administrative has one definition. */
export function titleFor(route: RouteDef): string {
  if (route === HOME_ROUTE) return APP_NAME
  const page = ADMIN_ROUTES.includes(route) ? `Admin: ${route.title}` : route.title
  return `${page} · ${APP_NAME}`
}

/* Called once, above the session gate, so the sign-in page is named after the
   page it will open rather than left on whatever the last one wrote. */
export function useDocumentTitle(): void {
  const [{ route }] = useRoute()

  useEffect(() => {
    document.title = titleFor(route)
  }, [route])
}
