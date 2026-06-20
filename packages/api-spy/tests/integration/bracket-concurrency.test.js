// bracket-concurrency.test.js — SC-004 stress test for the
// bracket API. Mirrors the express.test.js SC-004 test but goes
// through startRequest()/endRequest() directly (no Express).
//
// What this guards:
// - `_lastBracketCtx` is a module-level singleton; under N parallel
//   requests, endRequest() must resolve the right ctx for each call.
// - ALS isolation: queries recorded under request A must not appear
//   in request B's record.
// - Storage: 100 distinct ids → 100 records, zero collisions.
//
// CONCURRENT-CALL LIMITATION:
// startRequest() uses AsyncLocalStorage.enterWith(), which binds the
// ctx to the current async chain. Two siblings under Promise.all share
// the same async chain until either hits an await. So `startRequest()`
// calls in the same synchronous tick will collide — the second one
// sees the first's ctx and refuses to nest.
//
// The contract is: callers must serialize startRequest() calls (or
// yield between them via `await new Promise(r => setImmediate(r))`).
// The Express middleware satisfies this implicitly because each
// request enters its own middleware-chain async context.
//
// These tests pin that contract by yielding once between startRequest
// calls so siblings don't collide.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  startRequest, endRequest, start, end,
  createInMemoryStore, init
} from '../../src/index.js'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const yield_ = () => new Promise((r) => setImmediate(r))

test('SC-004 bracket: 100 concurrent startRequest/endRequest produce 100 distinct ids and 100 records', async () => {
  const store = createInMemoryStore({ capacity: 200 })
  init({ store })

  const N = 100
  const observedIds = new Set()
  const work = async (i) => {
    // Yield first so this async chain is independent of the test
    // harness chain. startRequest() relies on enterWith() and two
    // siblings under the same parent chain would collide.
    await yield_()
    const reqId = startRequest()
    observedIds.add(reqId)
    // Each request does 1-3 instrumented calls.
    const numQueries = (i % 3) + 1
    const qIds = []
    for (let j = 0; j < numQueries; j++) {
      const qid = start(`req.${i}.q.${j}`, { metadata: { batch: i, q: j } })
      qIds.push(qid)
      // Yield to the event loop to interleave with siblings.
      await yield_()
    }
    for (const qid of qIds) end(qid)
    endRequest()
  }

  await Promise.all(Array.from({ length: N }, (_, i) => work(i)))

  // Every request must have produced a distinct UUID.
  assert.equal(observedIds.size, N, `${N} distinct request ids`)
  for (const id of observedIds) assert.match(id, UUID_V4)

  // The store must contain N records, none evicted (capacity=200 > N=100).
  assert.equal(store.size(), N, 'all N records must be persisted')
  for (const id of observedIds) {
    const record = store.get(id)
    assert.ok(record, `record for ${id} must exist`)
    for (const q of record.queries) {
      assert.equal(q.status, 'ok')
      assert.equal(q.error, null)
      assert.match(q.id, UUID_V4)
    }
  }
})

test('SC-004 bracket: 100 concurrent requests, queries do not bleed across requests', async () => {
  // Tighter check: each request's record contains ONLY its own
  // queries, tagged with its batch metadata. We track the id each
  // batch produced and walk those.
  const store = createInMemoryStore({ capacity: 200 })
  init({ store })

  const N = 50
  const idByBatch = new Map()
  const work = async (i) => {
    await yield_()
    const id = startRequest()
    idByBatch.set(i, id)
    const a = start('step.a', { metadata: { batch: i } })
    await yield_()
    const b = start('step.b', { metadata: { batch: i } })
    await yield_()
    end(a)
    end(b)
    endRequest()
  }

  await Promise.all(Array.from({ length: N }, (_, i) => work(i)))

  assert.equal(store.size(), N)
  for (let i = 0; i < N; i++) {
    const id = idByBatch.get(i)
    const record = store.get(id)
    assert.ok(record, `record for batch ${i} (id=${id}) must exist`)
    for (const q of record.queries) {
      assert.equal(q.metadata.batch, i,
        `request id=${id} contains a query from batch=${q.metadata.batch} (expected ${i})`)
    }
    assert.equal(record.queries.length, 2)
  }
})

test('SC-004 bracket: errors in some requests do not affect siblings', async () => {
  const store = createInMemoryStore({ capacity: 100 })
  init({ store })

  const N = 20
  const idByBatch = new Map()
  const work = async (i) => {
    await yield_()
    const id = startRequest()
    idByBatch.set(i, id)
    const qid = start(`req.${i}`)
    if (i % 3 === 0) {
      end(qid, { error: new Error(`batch ${i} failed`) })
      endRequest({ error: new Error(`request ${i} failed`) })
    } else {
      end(qid)
      endRequest()
    }
  }

  await Promise.all(Array.from({ length: N }, (_, i) => work(i)))

  assert.equal(store.size(), N)
  let errorCount = 0
  let okCount = 0
  for (let i = 0; i < N; i++) {
    const id = idByBatch.get(i)
    const r = store.get(id)
    if (i % 3 === 0) {
      assert.equal(r.status, 'error', `batch ${i} must be marked error`)
      errorCount++
    } else {
      assert.equal(r.status, 'ok', `batch ${i} must be ok`)
      okCount++
    }
  }
  // Every i % 3 === 0 → error; others → ok.
  // N=20: 0,3,6,9,12,15,18 → 7 errors, 13 ok.
  assert.equal(errorCount, 7, 'expected exactly 7 errored requests (i % 3 === 0 in [0,20))')
  assert.equal(okCount, 13, 'expected exactly 13 ok requests')
})

test('CONCURRENT LIMITATION: startRequest() called twice in the same async tick refuses to nest', async () => {
  // Pins the documented limitation: startRequest() uses
  // AsyncLocalStorage.enterWith(), which does NOT create a stack
  // frame. Two sibling startRequest() calls in the same synchronous
  // tick will collide. Callers must yield (e.g. `await new Promise(r
  // => setImmediate(r))`) between requests, OR use the express
  // middleware (which has its own async context per request).
  const store = createInMemoryStore({ capacity: 10 })
  init({ store })

  startRequest()
  assert.throws(
    () => startRequest(),
    /request context is already active/,
    'two sibling startRequest() calls without an await between them must refuse to nest'
  )
  endRequest()
})

test('SC-004 bracket: getRequestId() returns null between sequential requests, the right id inside', async () => {
  const store = createInMemoryStore({ capacity: 10 })
  init({ store })
  const { getRequestId } = await import('../../src/index.js')

  const N = 10
  const seenInside = new Set()
  for (let i = 0; i < N; i++) {
    assert.equal(getRequestId(), null, 'getRequestId must be null before startRequest')
    const id = startRequest()
    seenInside.add(id)
    assert.equal(getRequestId(), id, 'getRequestId must match the active request id')
    // Yield to the event loop to interleave with any pending siblings.
    await new Promise((r) => setImmediate(r))
    assert.equal(getRequestId(), id, 'getRequestId must remain stable across awaits')
    endRequest()
    assert.equal(getRequestId(), null, 'getRequestId must be null after endRequest')
  }
  assert.equal(seenInside.size, N, `${N} distinct ids observed inside requests`)
})