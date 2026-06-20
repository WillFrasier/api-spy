// T010 — AsyncLocalStorage-backed request context.
// Covers: US2 (correlate across async), FR-002 (run()), FR-004 (getRequestId())
// Contract: data-model.md §Core Types, §Lifecycle
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { bindContextAccessor } from './log.js'

const storage = new AsyncLocalStorage()
bindContextAccessor(() => storage.getStore() || null)

/**
 * @typedef {Object} ActiveQuery
 * @property {string} id
 * @property {string} name
 * @property {number} startTimeMs
 * @property {number|null} endTimeMs
 * @property {('ok'|'error'|'incomplete')} status
 * @property {object|null} error
 * @property {object|null} metadata
 */

/**
 * @typedef {Object} RequestContext
 * @property {string} id
 * @property {string} startTime                 ISO 8601 with milliseconds
 * @property {number} startTimeMs               ms since epoch (for fast arithmetic)
 * @property {Array<import('./track.js').Query>} queries
 * @property {Array<ActiveQuery>} openQueries   stack of unfinished track() calls
 * @property {Record<string, unknown>|null} [metadata]    request-level metadata
 * @property {object} [_bracket]                internal — set by startRequest() so endRequest() can identify its own ctx
 */

/**
 * Accessor for the underlying AsyncLocalStorage. Used by bracket.js's
 * startRequest() to enter its ctx through the same ALS as run(), so
 * run() correctly refuses to nest inside a bracket request and
 * getRequestId() / _activeContext() see both forms uniformly.
 *
 * NOT exported from index.js.
 *
 * @returns {AsyncLocalStorage<any>}
 */
export function getStorage () {
  return storage
}

/**
 * Run `fn` inside a fresh request context. The context (including the
 * generated UUID) is preserved across all awaits, setTimeouts, microtasks,
 * and nested calls.
 *
 * If `opts.id` is provided, it is used instead of generating a new UUID.
 * This is how the Express middleware shares its pre-generated request id
 * with the run() context, so the X-ApiSpy-RequestId response header and
 * apiSpy.getRequestId() inside handlers refer to the same id.
 *
 * @template T
 * @param {() => T | Promise<T>} fn
 * @param {{ id?: string }} [opts]
 * @returns {Promise<T>}
 */
export function run (fn, opts = {}) {
  // run() inside an already-active request: just execute fn in the
  // existing context. This preserves the existing Phase 1 contract
  // where a route handler can call run() to assert the request id
  // even though the express middleware already opened the scope.
  // The bracket API's startRequest()/endRequest() is the one that
  // refuses to nest — see bracket.js for the rule that applies there.
  const id = opts.id || randomUUID()
  const startTimeMs = Date.now()
  /** @type {RequestContext} */
  const ctx = {
    id,
    startTime: new Date(startTimeMs).toISOString(),
    startTimeMs,
    queries: [],
    openQueries: []
  }
  return Promise.resolve(storage.run(ctx, fn))
}

/**
 * @returns {string|null} the active request id, or null if not inside a run()
 */
export function getRequestId () {
  const ctx = storage.getStore()
  return ctx ? ctx.id : null
}

/**
 * Internal accessor used by track.js (and the context.test.js suite).
 * @returns {RequestContext | null}
 */
export function _activeContext () {
  return storage.getStore() || null
}