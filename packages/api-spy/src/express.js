// T027 — Express middleware (stub for now; full impl comes in T027)
// Covers: US3 (FR-006)
//
// This stub exists so the public API surface (index.js) can import the
// `express` export without breaking track.js tests. The real implementation
// lives here once we get to T027.
//
// Until then, calling apiSpy.express() returns a middleware that just calls
// next() so the demo and integration tests can be wired without errors.

/**
 * Express middleware factory.
 * @returns {Function} an Express request handler
 */
export function express () {
  return function apiSpyExpressMiddleware (req, res, next) {
    // Stub pass-through. Real implementation arrives in T027.
    return next()
  }
}