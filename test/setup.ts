import { GlobalRegistrator } from '@happy-dom/global-registrator'

/* Loaded before the suite by bunfig.toml. Only the tests that render need a DOM,
   but registering it globally is cheaper than splitting the suite in two, and
   nothing in the logic tests looks at these. */

/* Except these four. happy-dom replaces the Fetch classes with browser ones,
   which enforce rules the server does not live under: a `cookie` header is
   forbidden in a browser, so a Request built with one silently arrives without
   it. The server tests drive the real request handler with real Requests, and
   the server runs on Bun's implementations, so those are put back after the
   DOM is registered. Without this, a test of anything cookie-shaped would pass
   or fail for reasons that have nothing to do with the server. */
const runtime = {
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
  fetch: globalThis.fetch,
}

GlobalRegistrator.register()

Object.assign(globalThis, runtime)

/* The knobs take pointer capture so a drag that leaves the element still tracks.
   happy-dom does not implement it, and without these a pointerdown throws before
   any drag can be exercised. No-ops are enough: capture changes where events are
   delivered, and a test dispatches them at the element directly anyway. */
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture() {}
  Element.prototype.releasePointerCapture = function releasePointerCapture() {}
  Element.prototype.hasPointerCapture = function hasPointerCapture() {
    return false
  }
}

/* Bun loads .env before any of this runs, and the server takes its configuration
   from the environment, so a developer who has set up sign-in was running a
   different application than CI was: oauth instead of off, and every write
   answering 401 rather than saving. Forty-five tests failed on that machine and
   nowhere else.

   The suite therefore runs in an empty environment. A test that needs
   configuration states it, as the sign-in tests already do by passing an object
   to authConfigFromEnv rather than reading the environment. */
for (const name of Object.keys(process.env)) {
  if (name.startsWith('MOOG_')) delete process.env[name]
}
