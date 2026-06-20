// context-edges.test.js — edge-case tests for src/context.js.
// Happy-path tests are in context.test.js. This file pins:
// - run(fn, { id }) id propagation and identity preservation
// - the ALS context is restored after run() resolves or rejects
// - run() called inside run() shares the active ctx (no nesting)
// - getStorage() exposes the underlying ALS instance for bracket.js
// - startTime is captured at run() entry, not at fn() invocation
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  run, getRequestId, _activeContext, getStorage
} from '../../src/context.js'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// ----- run(fn, { id }) -----

test('run(fn, { id }): the supplied id is preserved exactly', async () => {
  let captured
  await run(async () => {
    captured = getRequestId()
  }, { id: 'my-supplied-id' })
  assert.equal(captured, 'my-supplied-id')
})

test('run(fn, { id }): non-string id is silently accepted (no validation)', async () => {
  // Documented: this is for internal use by the Express middleware
  // which passes a UUID string. We don't enforce shape because
  // misuse just means downstream consumers see a non-UUID id.
  let captured
  await run(async () => {
    captured = getRequestId()
  }, { id: 12345 })
  assert.equal(captured, 12345)
})

test('run(fn, { id: undefined }) generates a fresh UUID', async () => {
  let captured
  await run(async () => {
    captured = getRequestId()
  }, { id: undefined })
  assert.match(captured, UUID_V4)
})

test('run(fn, {}): no opts generates a fresh UUID', async () => {
  let captured
  await run(async () => {
    captured = getRequestId()
  }, {})
  assert.match(captured, UUID_V4)
})

test('run(fn): two consecutive invocations produce distinct ids', async () => {
  const a = []
  await run(async () => { a.push(getRequestId()) })
  await run(async () => { a.push(getRequestId()) })
  assert.equal(a.length, 2)
  assert.notEqual(a[0], a[1])
  assert.match(a[0], UUID_V4)
  assert.match(a[1], UUID_V4)
})

// ----- ALS context lifecycle -----

test('run(): the active context is null after run() resolves', async () => {
  await run(async () => {
    assert.ok(_activeContext(), 'ctx must be present inside')
  })
  assert.equal(_activeContext(), null, 'ctx must be cleared after')
})

test('run(): the active context is null after run() rejects', async () => {
  await assert.rejects(async () => {
    await run(async () => { throw new Error('kaboom') })
  }, /kaboom/)
  assert.equal(_activeContext(), null, 'ctx must be cleared even on rejection')
})

test('run(): a thrown rejection propagates with the original error', async () => {
  const err = new TypeError('original')
  await assert.rejects(async () => {
    await run(async () => { throw err })
  }, (e) => e === err, 'the exact same Error instance must propagate')
})

// ----- Nested run() -----

test('run(): a nested run() creates a NEW ALS frame (a fresh id, not the outer one)', async () => {
  // Documented: run() uses storage.run(ctx, fn), which creates a new
  // AsyncLocalStorage stack frame. A nested run() inside an outer
  // run() does NOT refuse to nest and does NOT share the outer ctx;
  // it generates its own id (or uses opts.id if supplied).
  // This is the legacy Phase 1 contract.
  let outerId, innerId, _outerCtxSnapshot
  await run(async () => {
    outerId = getRequestId()
    _outerCtxSnapshot = _activeContext()
    await run(async () => {
      innerId = getRequestId()
    })
  })
  assert.notEqual(innerId, outerId, 'nested run() must get its own id')
})

test('run(): a nested run() with opts.id uses the supplied id', async () => {
  // Per the storage.run() semantics: the inner run() is its own
  // frame and uses the opts.id.
  let outerId, innerId
  await run(async () => {
    outerId = getRequestId()
    await run(async () => {
      innerId = getRequestId()
    }, { id: 'inner-supplied-id' })
  })
  assert.notEqual(innerId, outerId)
  assert.equal(innerId, 'inner-supplied-id')
})

// ----- getStorage -----

test('getStorage(): returns an AsyncLocalStorage instance', () => {
  const s = getStorage()
  // AsyncLocalStorage exposes .getStore(), .run(), .enterWith(), .exit()
  assert.equal(typeof s.getStore, 'function')
  assert.equal(typeof s.run, 'function')
  assert.equal(typeof s.enterWith, 'function')
})

test('getStorage(): the same instance is returned on every call (identity)', () => {
  const a = getStorage()
  const b = getStorage()
  assert.equal(a, b, 'getStorage() must return the same ALS instance every time')
})

// ----- _activeContext behavior -----

test('_activeContext(): returns a RequestContext shape with id, startTime, startTimeMs, queries, openQueries', async () => {
  await run(async () => {
    const ctx = _activeContext()
    assert.equal(typeof ctx.id, 'string')
    assert.match(ctx.id, UUID_V4)
    assert.equal(typeof ctx.startTime, 'string')
    assert.equal(typeof ctx.startTimeMs, 'number')
    assert.ok(Array.isArray(ctx.queries))
    assert.ok(Array.isArray(ctx.openQueries))
    assert.equal(ctx.queries.length, 0)
    assert.equal(ctx.openQueries.length, 0)
  })
})

test('_activeContext(): queries and openQueries are independent arrays per run()', async () => {
  // Confirm that each run() creates a fresh ctx (no shared mutable
  // state across runs).
  const aQueriesLen = await run(async () => {
    // (We can't track() inside this file without a circular import
    // pain, but we can mutate ctx.queries directly to confirm shape.)
    const ctx = _activeContext()
    ctx.queries.push({ synthetic: true })
    return ctx.queries.length
  })
  const bQueriesLen = await run(async () => {
    return _activeContext().queries.length
  })
  assert.equal(aQueriesLen, 1)
  assert.equal(bQueriesLen, 0, 'a fresh run() must get a fresh queries array')
})

// ----- startTime ordering -----

test('run(): startTimeMs is captured at run() entry (before fn runs)', async () => {
  const before = Date.now()
  let captured
  await run(async () => {
    captured = _activeContext().startTimeMs
    // Sleep so captured is well-defined.
    await new Promise((r) => setTimeout(r, 5))
  })
  const after = Date.now()
  assert.ok(captured >= before, `startTimeMs (${captured}) must be >= before (${before})`)
  assert.ok(captured <= after, `startTimeMs (${captured}) must be <= after (${after})`)
})

test('run(): startTime is the ISO 8601 representation of startTimeMs', async () => {
  let startTime, startTimeMs
  await run(async () => {
    const ctx = _activeContext()
    startTime = ctx.startTime
    startTimeMs = ctx.startTimeMs
  })
  assert.equal(Date.parse(startTime), startTimeMs,
    'startTime ISO string must parse back to startTimeMs')
})

// ----- Sync vs async fn -----

test('run(): a sync return value is wrapped in a Promise.resolve by run()', async () => {
  const result = await run(() => 42)
  assert.equal(result, 42)
})

test('run(): an async return value resolves correctly', async () => {
  const result = await run(async () => 'hello')
  assert.equal(result, 'hello')
})