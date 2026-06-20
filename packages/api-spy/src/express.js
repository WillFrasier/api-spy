// T027 — Express middleware (full implementation).
// Covers: US3 (FR-006) — open a request context, tag the response, save on finish.
// Contract: data-model.md §Lifecycle, Spec §FR-006
//
// Design:
//   1. Generate a UUID; set X-ApiSpy-RequestId on the response immediately
//      so even error paths carry it.
//   2. Open an apiSpy.run() context wrapping the rest of the request,
//      threading the same id in via run(fn, { id }).
//   3. Hand `next` straight through to Express; wait for the response to
//      finish OR close (client abort also produces a record).
//   4. Capture handler errors via a one-shot error listener on res.
//      Express propagates them to the user's error-handling chain; we
//      just record the fact on the request context.
//   5. On settle, finalize the Request record (status / duration / error)
//      and save it to the configured store.

import { randomUUID } from 'node:crypto'
import { run, _activeContext } from './context.js'
import { _store } from './index.js'
import { emitRequestComplete } from './wsHandler.js'

const HEADER_NAME = 'X-ApiSpy-RequestId'

/**
 * Express middleware factory.
 * @returns {Function} an Express request handler
 */
export function express () {
  return function apiSpyExpressMiddleware (req, res, next) {
    const id = randomUUID()
    res.setHeader(HEADER_NAME, id)

    // Capture handler errors via the response error event.
    // Express's own error pipeline still runs; we only observe the error
    // so the recorded Request is marked status='error'.
    let handlerError = null
    res.once('error', (err) => { handlerError = err })

    run(async () => {
      // Wait for the response to end. Either 'finish' (normal completion)
      // or 'close' (client aborted before all data flushed).
      await new Promise((resolve) => {
        let settled = false
        const settle = () => { if (!settled) { settled = true; resolve(undefined) } }
        res.once('finish', settle)
        res.once('close', settle)
        // Hand off to the rest of the middleware chain. Express handles
        // errors internally; we just observe them via the 'error' listener.
        next()
      })

      const ctx = _activeContext()
      if (!ctx) return
      finalizeAndSave(ctx, handlerError, res.statusCode)
    }, { id }).catch(() => { /* defensive — should not happen */ })
  }
}

function finalizeAndSave (ctx, err, statusCode) {
  const endTimeMs = Date.now()
  ctx.endTime = new Date(endTimeMs).toISOString()
  ctx.durationInMilliseconds = endTimeMs - ctx.startTimeMs
  // Aggregate child query statuses: any errored child promotes the
  // request to status='error', even if the HTTP layer handled the error
  // gracefully (Express error middleware, etc.). This is the right
  // signal for the user — if a backend call failed, the request is
  // "error" from the developer's perspective, even if the API itself
  // returned a 5xx. The Gantt shows the actual offender.
  //
  // Also: a 4xx/5xx HTTP response status, even with zero queries (e.g.
  // an auth guard that fails before any backend call), means the request
  // failed from the user's perspective. Mirror that into status='error'.
  const hasErroredChild = (ctx.queries || []).some((q) => q && q.status === 'error')
  const httpFailed = typeof statusCode === 'number' && statusCode >= 400
  if (err) ctx.status = 'error'
  else if (hasErroredChild) ctx.status = 'error'
  else if (httpFailed) ctx.status = 'error'
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
  } catch (_) { /* store failures must not crash the request */ }

  // Notify any active WS subscribers that the request is done.
  try {
    emitRequestComplete(ctx.id, ctx.status, ctx.durationInMilliseconds)
  } catch (_) { /* WS errors must not crash the request */ }
}