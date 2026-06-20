// queries.test.js — direct unit tests for the shared query lifecycle
// helpers. Both track() and the bracket API build records through
// these functions; the public-surface tests cover the integration,
// but a regression in finalizeQuery() (e.g. losing endTime) would
// fail dozens of tests at once. Pin the contract here with focused
// tests so failures point at the right module.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { newQuery, finalizeQuery, popOpen } from '../../src/queries.js'
import { setOnQuery, getOnQuery, _reset } from '../../src/onQuery.js'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const ISO_8601_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function makeCtx () {
  return {
    id: 'ctx-test',
    startTime: new Date().toISOString(),
    startTimeMs: Date.now(),
    queries: [],
    openQueries: []
  }
}

// ----- newQuery -----

test('newQuery(): assigns a v4 UUID and registers the query on ctx.queries + ctx.openQueries', () => {
  const ctx = makeCtx()
  const { query, startTimeMs } = newQuery(ctx, 'a')

  assert.match(query.id, UUID_V4)
  assert.equal(query.name, 'a')
  assert.equal(query.parentQueryId, null, 'top-level query has no parent')
  assert.match(query.startTime, ISO_8601_MS)
  assert.equal(query.endTime, null)
  assert.equal(query.durationInMilliseconds, 0)
  assert.equal(query.status, 'ok')
  assert.equal(query.error, null)
  assert.equal(query.metadata, null)

  assert.equal(typeof startTimeMs, 'number')
  assert.equal(ctx.queries.length, 1)
  assert.equal(ctx.queries[0], query)
  assert.deepEqual(ctx.openQueries, [query.id])
})

test('newQuery(): a second call on the same ctx gets the first as parent', () => {
  const ctx = makeCtx()
  const a = newQuery(ctx, 'a')
  const b = newQuery(ctx, 'b')
  assert.equal(b.query.parentQueryId, a.query.id)
  assert.deepEqual(ctx.openQueries, [a.query.id, b.query.id])
})

test('newQuery(): deeply nested calls chain via parentQueryId', () => {
  const ctx = makeCtx()
  const a = newQuery(ctx, 'a')
  const b = newQuery(ctx, 'b')
  const c = newQuery(ctx, 'c')
  assert.equal(a.query.parentQueryId, null)
  assert.equal(b.query.parentQueryId, a.query.id)
  assert.equal(c.query.parentQueryId, b.query.id)
})

test('newQuery(): opts.metadata is shallow-copied (caller mutation does not leak in)', () => {
  const ctx = makeCtx()
  const meta = { tokens: 100 }
  const { query } = newQuery(ctx, 'a', { metadata: meta })
  meta.tokens = 999
  meta.extra = 'leak?'
  assert.deepEqual(query.metadata, { tokens: 100 },
    'metadata must be a defensive copy — caller mutations must not bleed into the recorded query')
})

test('newQuery(): without opts.metadata, metadata is null (not undefined)', () => {
  const ctx = makeCtx()
  const { query } = newQuery(ctx, 'a')
  assert.equal(query.metadata, null)
})

test('newQuery(): with null ctx (orphan), no record is appended anywhere but a query is returned', () => {
  const { query } = newQuery(null, 'orphan')
  assert.equal(query.parentQueryId, null)
  assert.equal(query.status, 'ok')
  // No throw — this is the documented orphan behavior.
})

test('newQuery(): with null ctx, metadata opts still apply', () => {
  const { query } = newQuery(null, 'orphan', { metadata: { x: 1 } })
  assert.deepEqual(query.metadata, { x: 1 })
})

// ----- finalizeQuery -----

test('finalizeQuery(): sets endTime, durationInMilliseconds, status, error for ok', () => {
  const { query, startTimeMs } = newQuery(makeCtx(), 'ok')
  // Force a measurable duration.
  const start = Date.now()
  // Spin a few ticks so durationInMilliseconds is non-zero.
  while (Date.now() - start < 2) { /* spin */ }
  finalizeQuery(makeCtx(), query, 'ok', null, startTimeMs)
  assert.match(query.endTime, ISO_8601_MS)
  assert.ok(query.durationInMilliseconds >= 0)
  assert.equal(query.status, 'ok')
  assert.equal(query.error, null)
})

test('finalizeQuery(): captures error shape (name, message, stack)', () => {
  const { query, startTimeMs } = newQuery(makeCtx(), 'boom')
  const err = new TypeError('connection refused')
  finalizeQuery(makeCtx(), query, 'error', err, startTimeMs)
  assert.equal(query.status, 'error')
  assert.equal(query.error.name, 'TypeError')
  assert.equal(query.error.message, 'connection refused')
  assert.match(query.error.stack, /TypeError: connection refused/)
})

test('finalizeQuery(): error.name defaults to "Error" if missing', () => {
  const { query, startTimeMs } = newQuery(makeCtx(), 'no-name')
  // An Error-like without a name
  const err = new Error('oops')
  delete err.name
  finalizeQuery(makeCtx(), query, 'error', err, startTimeMs)
  assert.equal(query.error.name, 'Error')
})

test('finalizeQuery(): a non-Error throwable (string) is coerced to a message', () => {
  const { query, startTimeMs } = newQuery(makeCtx(), 'string-throw')
  finalizeQuery(makeCtx(), query, 'error', 'just a string', startTimeMs)
  assert.equal(query.status, 'error')
  assert.equal(query.error.message, 'just a string')
  assert.equal(query.error.name, 'Error')
  assert.equal(query.error.stack, '')
})

test('finalizeQuery(): status="incomplete" leaves error null (no error attached)', () => {
  const { query, startTimeMs } = newQuery(makeCtx(), 'leaked')
  finalizeQuery(makeCtx(), query, 'incomplete', null, startTimeMs)
  assert.equal(query.status, 'incomplete')
  assert.equal(query.error, null)
})

test('finalizeQuery(): notifies the onQuery hook with (ctx, query)', () => {
  _reset()
  const ctx = makeCtx()
  let observed = null
  setOnQuery((c, q) => { observed = { ctx: c, query: q } })
  const { query, startTimeMs } = newQuery(ctx, 'observed')
  finalizeQuery(ctx, query, 'ok', null, startTimeMs)
  assert.equal(observed.ctx, ctx)
  assert.equal(observed.query, query)
})

test('finalizeQuery(): subscriber errors are swallowed (must never break the caller)', () => {
  _reset()
  setOnQuery(() => { throw new Error('subscriber kaboom') })
  const { query, startTimeMs } = newQuery(makeCtx(), 'safe')
  // Must not throw.
  finalizeQuery(makeCtx(), query, 'ok', null, startTimeMs)
  assert.equal(query.status, 'ok')
})

test('finalizeQuery(): no onQuery hook set — no-op, no throw', () => {
  _reset()
  const { query, startTimeMs } = newQuery(makeCtx(), 'no-hook')
  finalizeQuery(makeCtx(), query, 'ok', null, startTimeMs)
  assert.equal(query.status, 'ok')
})

// ----- popOpen -----

test('popOpen(): pops the matching id from the stack', () => {
  const ctx = makeCtx()
  const a = newQuery(ctx, 'a')
  const b = newQuery(ctx, 'b')
  popOpen(ctx, a.query.id)
  assert.deepEqual(ctx.openQueries, [b.query.id])
})

test('popOpen(): with null ctx is a no-op (does not throw)', () => {
  // Should not throw.
  popOpen(null, 'any-id')
})

test('popOpen(): with an unknown id is a no-op', () => {
  const ctx = makeCtx()
  newQuery(ctx, 'a')
  popOpen(ctx, '00000000-0000-4000-8000-000000000000')
  assert.equal(ctx.openQueries.length, 1, 'unknown id must not affect the stack')
})

test('popOpen(): popping an inner id leaves outer ids in place', () => {
  // This is the case the bracket API uses when end() is called out of
  // declaration order (e.g. an inner end() while the outer is still open).
  const ctx = makeCtx()
  const a = newQuery(ctx, 'a')
  const b = newQuery(ctx, 'b')
  popOpen(ctx, b.query.id)
  assert.deepEqual(ctx.openQueries, [a.query.id])
})

test('popOpen(): popping the same id twice is a no-op the second time', () => {
  const ctx = makeCtx()
  const a = newQuery(ctx, 'a')
  popOpen(ctx, a.query.id)
  popOpen(ctx, a.query.id)
  assert.equal(ctx.openQueries.length, 0)
})

// ----- Round-trip: newQuery → finalizeQuery → popOpen -----

test('round-trip: newQuery + finalizeQuery + popOpen leaves a clean ctx', () => {
  const ctx = makeCtx()
  const { query, startTimeMs } = newQuery(ctx, 'round.trip', { metadata: { x: 1 } })
  finalizeQuery(ctx, query, 'ok', null, startTimeMs)
  popOpen(ctx, query.id)

  assert.equal(ctx.queries.length, 1, 'query is registered')
  assert.equal(ctx.openQueries.length, 0, 'open-queries stack is clean after pop')
  assert.equal(ctx.queries[0].status, 'ok')
  assert.equal(ctx.queries[0].endTime !== null, true)
})