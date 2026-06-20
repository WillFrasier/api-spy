// queries.js — single source of truth for query lifecycle.
//
// Both `track(name, fn)` and the bracket API `start(name) / end(id)`
// build their Query records through these helpers so the parent
// resolution, finalize, and onQuery-notify logic never diverges.
//
// Contract: data-model.md §Core Types (Query), §Lifecycle
//
// Design:
// - `newQuery(ctx, name, opts)` mints the Query, decides its parent
//   from the active open-queries stack, and registers it on the
//   request context.
// - `finalizeQuery(query, status, err, startTimeMs)` sets endTime /
//   duration / error and notifies the onQuery hook. Safe to call
//   outside a request context (ctx may be null).
// - `popOpen(ctx, queryId)` is the matching stack pop for newQuery.
//   It is a no-op if ctx is null or the id is not on the top of the
//   stack — bracket-API end(id) may legitimately pop an inner id when
//   the outer call has not yet finished.
import { randomUUID } from 'node:crypto'
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
 * @param {import('./context.js').RequestContext|null} ctx
 * @param {string} name
 * @param {{ metadata?: Record<string, unknown> }} [opts]
 * @returns {{ query: Query, startTimeMs: number }}
 */
export function newQuery (ctx, name, opts = {}) {
  const queryId = randomUUID()
  const startTimeMs = Date.now()

  // parentQueryId is the most recent OPEN (unfinished) query on the
  // stack — same rule as track(). When ctx is null we record a
  // standalone query with no parent (matches track()'s orphan behavior).
  const parentQueryId = ctx && ctx.openQueries.length > 0
    ? ctx.openQueries[ctx.openQueries.length - 1]
    : null

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

  if (ctx) {
    ctx.queries.push(query)
    ctx.openQueries.push(queryId)
  }

  return { query, startTimeMs }
}

/**
 * Finalize a query record and fire the onQuery hook.
 *
 * @param {import('./context.js').RequestContext|null} ctx
 * @param {Query} query
 * @param {('ok'|'error'|'incomplete')} status
 * @param {Error|null} err
 * @param {number} startTimeMs
 */
export function finalizeQuery (ctx, query, status, err, startTimeMs) {
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
  } else {
    query.error = null
  }
  notify(ctx, query)
}

function notify (ctx, query) {
  const hook = getOnQuery()
  if (!hook) return
  try {
    hook(ctx, query)
  } catch {
    // Subscriber errors must never break the caller's flow.
  }
}

/**
 * Pop a query id off the open-queries stack. Used by track() (always
 * the top) and by the bracket API (may be an inner id if end(id) is
 * called out of order). Safe no-op if ctx is null or the id is not on
 * the stack — callers may have already popped it via a different path.
 *
 * @param {import('./context.js').RequestContext|null} ctx
 * @param {string} queryId
 */
export function popOpen (ctx, queryId) {
  if (!ctx) return
  const idx = ctx.openQueries.lastIndexOf(queryId)
  if (idx >= 0) ctx.openQueries.splice(idx, 1)
}