// T019+T020 — track() implementation.
// Covers: US1 (instrument a slow op), FR-003 (record name, start/end, duration, status, error, parentQueryId)
// Contract: data-model.md §Core Types (Query), §Lifecycle, §Serialization Rules
//
// Design notes:
// - We always create a query entry BEFORE running fn() (so an error in fn
//   still leaves a record).
// - parentQueryId is the id of the most recent open (unfinished) query on
//   the stack. If none, parentQueryId is null.
// - When track() is called outside a run() context, we still record a
//   standalone query (no parent, no request id) — the call does not throw.
//   This matches the FR-001 public surface: track() is usable standalone.
import { randomUUID } from 'node:crypto'
import { _activeContext } from './context.js'
import { getOnQuery } from './onQuery.js'

/**
 * @typedef {Object} Query
 * @property {string} id
 * @property {string} name
 * @property {string|null} parentQueryId
 * @property {string} startTime
 * @property {string|null} endTime
 * @property {number} durationInMilliseconds
 * @property {('ok'|'error'|'incomplete')} status
 * @property {{name:string,message:string,stack:string}|null} error
 * @property {Record<string, unknown>|null} metadata
 */

/**
 * @template T
 * @param {string} name
 * @param {() => T | Promise<T>} fn
 * @param {{
 *   metadata?: Record<string, unknown>,
 *   onResult?: (result: T) => Record<string, unknown> | null | undefined
 * }} [opts]
 *   onResult(result) — optional callback invoked after fn() resolves
 *   successfully. Its return value is merged into the query's metadata,
 *   so callers can record information that is only known after the call
 *   completes (e.g. LLM tokens / cost from the API response). Errors
 *   thrown by onResult are caught and ignored — they must never break
 *   the call. Not invoked if fn() throws.
 * @returns {Promise<T>}
 */
export async function track (name, fn, opts = {}) {
  const ctx = _activeContext()
  const queryId = randomUUID()
  const startTimeMs = Date.now()

  // Determine parent: the most recent open query on the stack (if any).
  // ctx.openQueries is maintained by track() itself; it is a stack of ids.
  const parentQueryId = ctx && ctx.openQueries.length > 0
    ? ctx.openQueries[ctx.openQueries.length - 1]
    : null

  if (ctx) ctx.openQueries.push(queryId)

  /** @type {Query} */
  const query = {
    id: queryId,
    name,
    parentQueryId,
    startTime: new Date(startTimeMs).toISOString(),
    endTime: null,
    durationInMilliseconds: 0,
    status: 'ok',
    error: null,
    metadata: opts && opts.metadata ? { ...opts.metadata } : null
  }
  if (ctx) ctx.queries.push(query)

  try {
    const result = await fn()
    // Allow the caller to merge post-call metadata (e.g. LLM tokens/cost).
    if (opts && typeof opts.onResult === 'function') {
      try {
        const extra = opts.onResult(result)
        if (extra && typeof extra === 'object') {
          query.metadata = query.metadata
            ? { ...query.metadata, ...extra }
            : { ...extra }
        }
      } catch (_) {
        // onResult must never break the caller's flow.
      }
    }
    finalize(query, 'ok', null, startTimeMs)
    notify(ctx, query)
    return result
  } catch (err) {
    finalize(query, 'error', err, startTimeMs)
    notify(ctx, query)
    throw err
  } finally {
    if (ctx) ctx.openQueries.pop()
  }
}

function notify (ctx, query) {
  const hook = getOnQuery()
  if (!hook) return
  try {
    hook(ctx, query)
  } catch (_) {
    // Subscriber errors must not break track()
  }
}

function finalize (query, status, err, startTimeMs) {
  const endTimeMs = Date.now()
  query.endTime = new Date(endTimeMs).toISOString()
  query.durationInMilliseconds = endTimeMs - startTimeMs
  query.status = status
  if (err) {
    query.error = {
      name: err.name || 'Error',
      message: String(err.message ?? err),
      stack: typeof err.stack === 'string' ? err.stack : ''
    }
  }
}