// T012 — public SDK surface.
// Public API: run, track, getRequestId, init, express, _store,
//   start, end, startRequest, endRequest
// Contract: data-model.md §API Surface, spec.md §FR-001

import { createInMemoryStore } from './store.js'
import { _activeContext } from './context.js'
import { setOnQuery, _reset as _resetOnQueryForTests } from './onQuery.js'

export { run, getRequestId, _activeContext } from './context.js'
export { track } from './track.js'
export { express as expressMiddleware } from './express.js'
export { createInMemoryStore } from './store.js'
// Imperative bracket sibling of track() — start/end for queries,
// startRequest/endRequest as an alternative to run(fn). See
// packages/api-spy/src/bracket.js for the contract.
export { start, end, startRequest, endRequest } from './bracket.js'

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
  if (opts.onQuery !== undefined) {
    setOnQuery(opts.onQuery)
  }
  // Spec §FR-012: a single [api-spy] log line on init confirming store type.
  // (intentionally without requestId — init happens before any request.)
   
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

export { wsHandler, emitRequestComplete } from './wsHandler.js'

// Test-only escape hatch for clearing the onQuery hook between tests.
export { _resetOnQueryForTests }