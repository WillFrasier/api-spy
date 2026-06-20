// T010 — AsyncLocalStorage-backed request context.
// Covers: US2 (correlate across async), FR-002 (run()), FR-004 (getRequestId())
// Contract: data-model.md §Core Types, §Lifecycle
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { bindContextAccessor } from './log.js'

const storage = new AsyncLocalStorage()

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
 */

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
  // bindContextAccessor lets log.js pick up the active context for [api-spy] logs.
  bindContextAccessor(() => storage.getStore() || null)
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