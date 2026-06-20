// T011 + T021 — context unit tests (FAILING — implementation does not exist yet)
// Covers: US2 (correlate across async boundaries) + FR-002/FR-004
import { test } from 'node:test'
import assert from 'node:assert/strict'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('run(): assigns a v4 UUID to each invocation', async () => {
  const { run, getRequestId } = await import('../../src/context.js')
  const ids = new Set()
  for (let i = 0; i < 10; i++) {
    await run(async () => {
      ids.add(getRequestId())
    })
  }
  assert.equal(ids.size, 10, 'each run() should produce a unique id')
  for (const id of ids) {
    assert.match(id, UUID_V4, `id ${id} must be a UUID v4`)
  }
})

test('getRequestId(): returns null outside a run() context', async () => {
  const { getRequestId } = await import('../../src/context.js')
  assert.equal(getRequestId(), null)
})

test('run(): inner getRequestId() equals the id captured by the run callback', async () => {
  const { run, getRequestId } = await import('../../src/context.js')
  let outerId
  let innerId
  await run(async () => {
    outerId = getRequestId()
    await Promise.resolve()
    innerId = getRequestId()
  })
  assert.ok(outerId)
  assert.equal(innerId, outerId, 'id must be preserved across a microtask boundary')
})

test('run(): id is preserved across an awaited setTimeout', async () => {
  const { run, getRequestId } = await import('../../src/context.js')
  let before, insideTimeout
  await run(async () => {
    before = getRequestId()
    await new Promise((r) => setTimeout(r, 5))
    insideTimeout = getRequestId()
  })
  assert.equal(insideTimeout, before, 'id must survive setTimeout')
})

test('run(): id is preserved across Promise.all of independent awaits', async () => {
  const { run, getRequestId } = await import('../../src/context.js')
  const observed = []
  await run(async () => {
    const id = getRequestId()
    await Promise.all([
      Promise.resolve().then(() => observed.push(getRequestId())),
      new Promise((r) => setTimeout(r, 3)).then(() => observed.push(getRequestId())),
      Promise.resolve().then(() => observed.push(getRequestId()))
    ])
    assert.equal(id, getRequestId())
  })
  assert.equal(observed.length, 3)
  for (const id of observed) assert.equal(id, observed[0], 'all parallel branches must see the same id')
})

test('run(): concurrent runs do not bleed ids across each other', async () => {
  const { run, getRequestId } = await import('../../src/context.js')
  const seen = new Map()
  await Promise.all(Array.from({ length: 50 }, async (_, i) => {
    await run(async () => {
      const id = getRequestId()
      // Yield the event loop a few times to allow interleaving.
      await new Promise((r) => setImmediate(r))
      await new Promise((r) => setTimeout(r, 1))
      assert.equal(getRequestId(), id, `run #${i}: id must remain stable`)
      if (!seen.has(id)) seen.set(id, 0)
      seen.set(id, seen.get(id) + 1)
    })
  }))
  assert.equal(seen.size, 50, 'all 50 runs produced distinct ids')
})

test('run(): returned value and rejection propagate unchanged', async () => {
  const { run } = await import('../../src/context.js')
  // Resolve case
  const value = await run(async () => 42)
  assert.equal(value, 42)
  // Reject case
  await assert.rejects(async () => {
    await run(async () => { throw new TypeError('nope') })
  }, (err) => err instanceof TypeError && err.message === 'nope')
})

test('run(): a sync throw inside the callback rejects the returned promise', async () => {
  const { run } = await import('../../src/context.js')
  await assert.rejects(async () => {
    await run(() => { throw new RangeError('sync') })
  }, (err) => err instanceof RangeError)
})

test('run(): captures startTime as an ISO 8601 string with milliseconds', async () => {
  const { run, _activeContext } = await import('../../src/context.js')
  let captured
  await run(async () => {
    captured = _activeContext().startTime
  })
  assert.match(captured, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  // Sanity: the captured startTime should be close to "now"
  const drift = Math.abs(Date.parse(captured) - Date.now())
  assert.ok(drift < 5000, `startTime should be close to now; drift was ${drift}ms`)
})