import { GlobalRegistrator } from '@happy-dom/global-registrator'

/* Loaded before the suite by bunfig.toml. Only the tests that render need a DOM,
   but registering it globally is cheaper than splitting the suite in two, and
   nothing in the logic tests looks at these. */
GlobalRegistrator.register()

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

/* A select cannot open its own list here, and the component asks it to. */
if (!HTMLSelectElement.prototype.showPicker) {
  HTMLSelectElement.prototype.showPicker = function showPicker() {}
}
