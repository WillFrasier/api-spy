// bracket.js — imperative (start / end) sibling of track().
//
// Where track() wraps a synchronous return-or-throw in a closure,
// start()/end() lets the caller bracket any code — streaming,
// event-driven, multi-statement, third-party SDKs that hand back
// emitters — without inventing a fake promise to wrap.
//
// Public surface:
//
//   apiSpy.start('db.users.findById', { metadata: { table: 'users' } })
//   try {
//     const user = await db.findUser(id)
//     apiSpy.end(queryId, { metadata: { rowCount: 1 } })
//   } catch (err) {
//     apiSpy.end(queryId, { error: err })
//     throw err
//   }
//
// For top-level request scope (the apiSpy.run(fn) wrapper):
//
//   const reqId = apiSpy.startRequest({ id: 'optional-supplied-id' })
//   try {
//     // ... do work, with apiSpy.start / apiSpy.end inside ...
//     apiSpy.endRequest()
//   } catch (err) {
//     apiSpy.endRequest({ error: err })
//     throw err
//   }
//
// Contract rules:
// - end(id) requires the id returned by start(). The SDK does NOT
//   auto-track an LIFO stack — explicit ids make call sites readable
//   and survive code refactors.
// - start() outside a request context still records a standalone query
//   (matches track()'s orphan behavior). end() of an orphan throws —
//   the developer should use track() for the orphan case.
// - end() on an unknown or already-ended id throws.
// - startRequest() inside an active request throws. One request per
//   scope (same rule the Express middleware enforces for
//   X-ApiSpy-RequestId). run() inside startRequest() also throws.
// - CONCURRENCY: startRequest() uses AsyncLocalStorage.enterWith(),
//   which binds the ctx to the current async chain but does NOT
//   create a stack frame. Two sibling startRequest() calls in the
//   same synchronous tick will collide — the second sees the first's
//   ctx and refuses to nest. Callers must yield (e.g.
//   `await new Promise(r => setImmediate(r))`) between sibling
//   startRequest() calls. The Express middleware does not have this
//   limitation because each request enters its own async context.
//   Pinned by tests/integration/bracket-concurrency.test.js.
// - Unclosed queries at endRequest() time are marked status='incomplete'
//   and the request itself is marked 'incomplete' if any queries are
//   still open, so the developer can see the leak.
//
// Architecture: the bracket API shares the SAME AsyncLocalStorage
// instance as apiSpy.run(). We enter the bracket ctx through that
// shared storage (via enterWith), so:
// - getRequestId() / _activeContext() return the bracket ctx for
//   the duration of the request, identical to run()'s semantics.
// - run() correctly refuses to nest inside an active bracket request
//   (it checks the same storage).
// - The bracket ctx is reachable past endRequest() via a module-level
//   reference so endRequest() is idempotent without a storage probe.
import { randomUUID } from 'node:crypto'
import { _activeContext } from './context.js'
import { newQuery, finalizeQuery } from './queries.js'
import { _store } from './index.js'
import { emitRequestComplete } from './wsHandler.js'
import { log } from './log.js'
import { getStorage } from './context.js'

/**
 * Begin a new instrumented query. Returns the query id; pass it to
 * `end(id)` to close the record.
 *
 * @param {string} name
 * @param {{ metadata?: Record<string, unknown> }} [opts]
 * @returns {string} the new query id (UUID v4)
 */
export function start (name, opts = {}) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('apiSpy.start(name): name must be a non-empty string')
  }
  const ctx = _activeContext()
  const { query } = newQuery(ctx, name, opts)
  return query.id
}

/**
 * Close a query opened by `start()`.
 *
 * Exactly one of:
 * - success path: `end(id)` or `end(id, { metadata })`
 * - failure path: `end(id, { error })`
 *
 * Metadata is merged into any metadata supplied at start() time.
 *
 * @param {string} id
 * @param {{ metadata?: Record<string, unknown>, error?: Error }} [opts]
 */
export function end (id, opts = {}) {
  if (typeof id !== 'string' || id.length === 0) {
    throw new TypeError('apiSpy.end(id): id must be the string returned by start()')
  }
  const ctx = _activeContext()
  if (!ctx) {
    throw new Error('apiSpy.end(id): no active request context. Did you call end() outside apiSpy.run() / startRequest()?')
  }
  const query = ctx.queries.find((q) => q.id === id)
  if (!query) {
    throw new Error(`apiSpy.end(id): no query with id=${id} on the active request. Did you call end() twice, or use the wrong id?`)
  }
  if (query.endTime !== null) {
    throw new Error(`apiSpy.end(id): query id=${id} was already ended at ${query.endTime}`)
  }

  const err = opts && opts.error ? opts.error : null
  const startTimeMs = Date.parse(query.startTime)
  if (opts && opts.metadata && typeof opts.metadata === 'object') {
    query.metadata = query.metadata
      ? { ...query.metadata, ...opts.metadata }
      : { ...opts.metadata }
  }
  finalizeQuery(ctx, query, err ? 'error' : 'ok', err, startTimeMs)
  const idx = ctx.openQueries.lastIndexOf(id)
  if (idx >= 0) ctx.openQueries.splice(idx, 1)
}

/**
 * Module-level reference to the most recently entered bracket ctx.
 * Used to make endRequest() idempotent — the ctx is reachable even
 * after the ALS exit has cleared the storage.
 *
 * @type {RequestContext | null}
 */
let _lastBracketCtx = null

/**
 * Begin a new top-level request scope. Returns the request id. Pair
 * with `endRequest()` exactly once. Cannot be nested — calling this
 * inside an active request (run() or another startRequest()) throws.
 *
 * @param {{ id?: string, metadata?: Record<string, unknown> }} [opts]
 * @returns {string} the new request id
 */
export function startRequest (opts = {}) {
  if (_activeContext()) {
    throw new Error('apiSpy.startRequest(): a request context is already active. Use apiSpy.run() / expressMiddleware() once per scope.')
  }
  const id = (opts && typeof opts.id === 'string' && opts.id.length > 0)
    ? opts.id
    : randomUUID()
  const startTimeMs = Date.now()
  const ctx = {
    id,
    startTime: new Date(startTimeMs).toISOString(),
    startTimeMs,
    queries: [],
    openQueries: [],
    metadata: opts && opts.metadata ? { ...opts.metadata } : null,
    _bracket: { finalized: false }
  }
  // Enter the shared run() ALS with the bracket ctx. From this point
  // onward _activeContext() / getRequestId() return this ctx, and any
  // nested run() correctly refuses to nest.
  getStorage().enterWith(ctx)
  _lastBracketCtx = ctx
  return id
}

/**
 * Close the current request scope. Finalizes the record, persists it
 * to the configured store, and emits the WS `request-complete` event.
 *
 * Pending queries that were never ended are marked status='incomplete'
 * before save — the developer can still see what was recorded, with
 * elapsed duration up to this point.
 *
 * Safe to call multiple times — second and later calls are no-ops so
 * callers can defensively call endRequest() in both success and error
 * branches without paying a double-save cost.
 *
 * @param {{ error?: Error, metadata?: Record<string, unknown> }} [opts]
 */
export function endRequest (opts = {}) {
  // Resolve the active bracket ctx. We allow the call right after the
  // ALS exit so a defensive double-call still no-ops; _lastBracketCtx
  // is the source of truth.
  const ctx = (_activeContext() && _activeContext()._bracket)
    ? _activeContext()
    : _lastBracketCtx
  if (!ctx || !ctx._bracket) {
    throw new Error('apiSpy.endRequest(): no bracket-mode request is active. Did you forget apiSpy.startRequest()?')
  }
  if (ctx._bracket.finalized) return
  ctx._bracket.finalized = true

  const endTimeMs = Date.now()
  ctx.endTime = new Date(endTimeMs).toISOString()
  ctx.durationInMilliseconds = endTimeMs - ctx.startTimeMs

  const err = opts && opts.error ? opts.error : null
  if (opts && opts.metadata && typeof opts.metadata === 'object') {
    ctx.metadata = ctx.metadata
      ? { ...ctx.metadata, ...opts.metadata }
      : { ...opts.metadata }
  }

  // Mark any still-open queries as 'incomplete'.
  for (const q of ctx.queries) {
    if (q.endTime === null) {
      const startTimeMs = Date.parse(q.startTime)
      finalizeQuery(ctx, q, 'incomplete', null, startTimeMs)
    }
  }
  ctx.openQueries.length = 0

  // Aggregate status — same rules as express.js's finalizeAndSave.
  const hasErroredChild = ctx.queries.some((q) => q && q.status === 'error')
  const hasIncompleteChild = ctx.queries.some((q) => q && q.status === 'incomplete')
  if (err) ctx.status = 'error'
  else if (hasErroredChild) ctx.status = 'error'
  else if (hasIncompleteChild) ctx.status = 'incomplete'
  else ctx.status = 'ok'

  if (err) {
    ctx.error = {
      name: err.name || 'Error',
      message: String(err.message ?? err),
      stack: typeof err.stack === 'string' ? err.stack : ''
    }
  } else {
    ctx.error = null
  }

  try {
    _store().save({
      id: ctx.id,
      startTime: ctx.startTime,
      endTime: ctx.endTime,
      durationInMilliseconds: ctx.durationInMilliseconds,
      status: ctx.status,
      error: ctx.error,
      queries: ctx.queries
    })
  } catch (saveErr) {
    log('warn', `failed to save request record id=${ctx.id}: ${saveErr.message}`)
  }

  try {
    emitRequestComplete(ctx.id, ctx.status, ctx.durationInMilliseconds)
  } catch { /* WS errors must not crash the request */ }

  // Clear the ALS scope so subsequent startRequest() / run() see no
  // active context. Node's ALS.exit() only works for run()-framed
  // scopes — startRequest() uses enterWith, so we use enterWith(undefined)
  // to clear the store from the same async context.
  try { getStorage().enterWith(undefined) } catch { /* safe */ }
}