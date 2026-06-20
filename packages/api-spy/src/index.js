// T012 — public SDK surface.
// Public API: run, track, getRequestId, init, express, _store
// Contract: data-model.md §API Surface, spec.md §FR-001

import { createInMemoryStore } from './store.js'
import { run, getRequestId, _activeContext } from './context.js'

export { run, getRequestId, _activeContext }
export { track } from './track.js'
export { express as expressMiddleware } from './express.js'
export { createInMemoryStore } from './store.js'

/** @type {import('./store.js').Store} */
let _store = createInMemoryStore()

/**
 * Initialize the SDK. Currently configures the storage adapter.
 *
 * @param {{ store?: import('./store.js').Store }} [opts]
 */
export function init (opts = {}) {
  if (opts.store) {
    _store = opts.store
  }
  // Spec §FR-012: a single [api-spy] log line on init confirming store type.
  // (intentionally without requestId — init happens before any request.)
  // eslint-disable-next-line no-console
  console.log(`[api-spy] initialized store=${_store.constructor.name || 'Store'} capacity=${_store.size?.() ?? 'n/a'}`)
}

/**
 * Internal accessor for in-process consumers (e.g., the demo debugger route).
 * Underscore prefix documents "not for external use."
 * @returns {import('./store.js').Store}
 */
export function _store_get () {
  return _store
}

// Re-export as `_store` for ergonomics — the demo uses `apiSpy._store()`.
export { _store_get as _store }