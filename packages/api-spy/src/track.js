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
// - Shared with the bracket API (`start()` / `end()`) through queries.js.
import { _activeContext } from './context.js'
import { newQuery, finalizeQuery, popOpen } from './queries.js'

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
  const { query, startTimeMs } = newQuery(ctx, name, opts)

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
    finalizeQuery(ctx, query, 'ok', null, startTimeMs)
    return result
  } catch (err) {
    finalizeQuery(ctx, query, 'error', err, startTimeMs)
    throw err
  } finally {
    popOpen(ctx, query.id)
  }
}