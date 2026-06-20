// bracket.test.js — unit tests for the imperative start()/end() sibling
// of track(), plus startRequest()/endRequest() as an alternative to
// apiSpy.run(fn). The bracket API is the public surface for callers
// who don't want to wrap their code in a closure.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  run, track, getRequestId, _activeContext,
  start, end, startRequest, endRequest,
  init, _resetOnQueryForTests
} from '../../src/index.js'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ----- Query scope: start() / end() inside run() -----

test('start()/end(): success path records a query with name, duration, status=ok', async () => {
  let ctx
  await run(async () => {
    ctx = _activeContext()
    const id = start('db.users.findById', { metadata: { table: 'users' } })
    await sleep(10)
    end(id)
  })

  assert.equal(ctx.queries.length, 1)
  const q = ctx.queries[0]
  assert.equal(q.name, 'db.users.findById')
  assert.match(q.id, UUID_V4)
  assert.equal(q.status, 'ok')
  assert.equal(q.error, null)
  assert.deepEqual(q.metadata, { table: 'users' })
  assert.ok(q.durationInMilliseconds >= 5, `expected ≥5ms, got ${q.durationInMilliseconds}ms`)
  assert.ok(q.endTime)
})

test('start()/end(): failure path records status=error and preserves the error', async () => {
  let ctx
  await run(async () => {
    ctx = _activeContext()
    const id = start('http.upstream.fetch')
    try {
      await sleep(5)
      throw new Error('upstream 503')
    } catch (err) {
      end(id, { error: err })
    }
  })

  const q = ctx.queries[0]
  assert.equal(q.status, 'error')
  assert.equal(q.error.name, 'Error')
  assert.equal(q.error.message, 'upstream 503')
  assert.match(q.error.stack, /Error: upstream 503/)
})

test('start()/end(): end(id, { metadata }) merges post-call metadata', async () => {
  let ctx
  await run(async () => {
    ctx = _activeContext()
    const id = start('llm.gpt-4o-mini.chat', { metadata: { provider: 'openai', model: 'gpt-4o-mini' } })
    await Promise.resolve()
    end(id, { metadata: { tokensIn: 142, tokensOut: 58, costUsd: 0.000123 } })
  })

  assert.deepEqual(ctx.queries[0].metadata, {
    provider: 'openai',
    model: 'gpt-4o-mini',
    tokensIn: 142,
    tokensOut: 58,
    costUsd: 0.000123
  })
})

test('start()/end(): nested calls chain via parentQueryId', async () => {
  let ctx
  await run(async () => {
    ctx = _activeContext()
    const outer = start('orchestrator.handle')
    await sleep(2)
    const inner = start('db.users.findById')
    await sleep(2)
    end(inner)
    end(outer)
  })

  const [outer, inner] = ctx.queries
  assert.equal(outer.parentQueryId, null)
  assert.equal(inner.parentQueryId, outer.id)
})

test('start()/end(): parallel siblings each get a parent chain via the open-queries stack', async () => {
  // Parent rule: parentQueryId is the top of the open-queries stack at
  // start() time. For SYNCHRONOUSLY registered siblings, the second
  // start() sees the first as its parent. To make siblings share an
  // outer parent, the caller can close the first sibling before
  // starting the second.
  let ctx
  await run(async () => {
    ctx = _activeContext()
    const outer = start('fanout')
    const a = start('a')
    end(a)             // close a before starting b so b sees outer on top
    const b = start('b')
    end(b)
    end(outer)
  })

  const [outer, a, b] = ctx.queries
  assert.equal(outer.name, 'fanout')
  assert.equal(a.name, 'a')
  assert.equal(b.name, 'b')
  assert.equal(a.parentQueryId, outer.id, 'a is a child of outer')
  assert.equal(b.parentQueryId, outer.id, 'b is a sibling of a — both under outer')
})

test('start() outside a request context is allowed and returns a query id (orphan start)', async () => {
  // Mirror track()'s orphan behavior at the start() edge: a start()
  // outside any request scope returns a query id but the query has no
  // parent and isn't saved anywhere. Callers wanting orphan capture
  // with a return value should use track(); start() exists to bracket
  // work that the SDK cannot wrap in a closure (streams, emitters).
  const id = start('orphan.query')
  assert.equal(typeof id, 'string')
  assert.match(id, UUID_V4)
  // No context — end() must reject this so we don't silently leak.
  assert.throws(() => end(id), /no active request context/)
})

test('start(): rejects empty name with TypeError', () => {
  assert.throws(() => start(''), TypeError)
  assert.throws(() => start(undefined), TypeError)
  assert.throws(() => start(123), TypeError)
})

test('end(): throws if called outside any request context', () => {
  assert.throws(() => end('some-id'), /no active request context/)
})

test('end(): throws on an unknown id', async () => {
  await run(async () => {
    assert.throws(() => end('00000000-0000-4000-8000-000000000000'), /no query with id=/)
  })
})

test('end(): throws when called twice on the same id (double-end is a bug)', async () => {
  await run(async () => {
    const id = start('once')
    end(id)
    assert.throws(() => end(id), /already ended at/)
  })
})

test('start()/end(): bracket API and track() produce identical record shapes', async () => {
  // Cross-check that bracket and closure paths land in the same
  // shape — the only difference should be the call site.
  let bracketCtx, trackCtx

  await run(async () => {
    bracketCtx = _activeContext()
    const id = start('cross.check', { metadata: { x: 1 } })
    await sleep(2)
    end(id, { metadata: { y: 2 } })
  })

  await run(async () => {
    trackCtx = _activeContext()
    await track('cross.check', async () => {
      await sleep(2)
      return 'ok'
    }, { metadata: { x: 1 }, onResult: () => ({ y: 2 }) })
  })

  const stripVolatile = (q) => ({
    name: q.name,
    status: q.status,
    error: q.error,
    metadata: q.metadata,
    parentQueryId: q.parentQueryId,
    hasId: typeof q.id === 'string',
    hasStartTime: typeof q.startTime === 'string',
    hasEndTime: typeof q.endTime === 'string',
    durationIsNumber: typeof q.durationInMilliseconds === 'number'
  })
  assert.deepEqual(stripVolatile(bracketCtx.queries[0]), stripVolatile(trackCtx.queries[0]))
})

// ----- Request scope: startRequest() / endRequest() -----

test('startRequest()/endRequest(): happy path persists a record to the store', async () => {
  const { createInMemoryStore } = await import('../../src/index.js')
  const store = createInMemoryStore({ capacity: 10 })
  init({ store })

  const reqId = startRequest()
  assert.match(reqId, UUID_V4)
  const qid = start('db.users.findById')
  await sleep(5)
  end(qid)
  endRequest()

  const record = store.get(reqId)
  assert.ok(record, 'record must be persisted')
  assert.equal(record.id, reqId)
  assert.equal(record.status, 'ok')
  assert.equal(record.error, null)
  assert.equal(record.queries.length, 1)
  assert.equal(record.queries[0].name, 'db.users.findById')
  assert.equal(record.queries[0].status, 'ok')
  assert.ok(record.durationInMilliseconds >= 0)
})

test('startRequest(): supplied id is preserved', () => {
  const id = startRequest({ id: 'supplied-id-1234' })
  assert.equal(id, 'supplied-id-1234')
  endRequest()
})

test('startRequest(): throws when called inside an active run() context', async () => {
  await run(async () => {
    assert.throws(() => startRequest(), /request context is already active/)
  })
})

test('startRequest(): throws when called twice without endRequest() in between', () => {
  startRequest()
  assert.throws(() => startRequest(), /request context is already active/)
  endRequest()
})

test('endRequest(): error path marks the request status=error and aggregates child errors', async () => {
  const { createInMemoryStore } = await import('../../src/index.js')
  const store = createInMemoryStore({ capacity: 10 })
  init({ store })

  const reqId = startRequest()
  const qid = start('db.users.findById')
  end(qid, { error: new Error('connection refused') })
  endRequest({ error: new Error('request exploded') })

  const record = store.get(reqId)
  assert.equal(record.status, 'error')
  assert.equal(record.error.message, 'request exploded')
  assert.equal(record.queries.length, 1)
  assert.equal(record.queries[0].status, 'error')
  assert.equal(record.queries[0].error.message, 'connection refused')
})

test('endRequest(): a child query error promotes the request to status=error even when no request error is given', async () => {
  const { createInMemoryStore } = await import('../../src/index.js')
  const store = createInMemoryStore({ capacity: 10 })
  init({ store })

  const reqId = startRequest()
  const qid = start('flaky')
  end(qid, { error: new Error('upstream 503') })
  endRequest()

  const record = store.get(reqId)
  assert.equal(record.status, 'error', 'child error must promote the request')
})

test('endRequest(): unclosed queries at endRequest() time are marked status=incomplete and the request too', async () => {
  // This catches the developer-bug case: they forgot to end() a query.
  const { createInMemoryStore } = await import('../../src/index.js')
  const store = createInMemoryStore({ capacity: 10 })
  init({ store })

  const reqId = startRequest()
  start('leaked.query')  // intentionally never ended
  endRequest()

  const record = store.get(reqId)
  assert.equal(record.queries.length, 1)
  assert.equal(record.queries[0].status, 'incomplete')
  assert.equal(record.status, 'incomplete',
    'request status must be incomplete when a child query was never ended')
})

test('endRequest(): idempotent — calling twice does not double-save', async () => {
  const { createInMemoryStore } = await import('../../src/index.js')
  const store = createInMemoryStore({ capacity: 10 })
  init({ store })

  const reqId = startRequest()
  endRequest()
  endRequest()  // must be a no-op

  // One record, not two.
  assert.ok(store.get(reqId))
  assert.equal(store.size(), 1)
})

test('endRequest(): after a request ends, getRequestId() returns null again', () => {
  startRequest()
  assert.ok(getRequestId(), 'id should be visible during the request')
  endRequest()
  assert.equal(getRequestId(), null, 'id should be cleared after endRequest()')
})

test('endRequest(): subsequent startRequest() works (ALS storage restored properly)', async () => {
  const { createInMemoryStore } = await import('../../src/index.js')
  const store = createInMemoryStore({ capacity: 10 })
  init({ store })

  const a = startRequest()
  endRequest()
  const b = startRequest()
  endRequest()

  assert.notEqual(a, b, 'each startRequest() must produce a fresh id')
  assert.ok(store.get(a))
  assert.ok(store.get(b))
  assert.equal(store.size(), 2)
})

test('startRequest() then startRequest(): refuses to nest (one request per scope)', () => {
  startRequest()
  assert.throws(
    () => startRequest(),
    /request context is already active/,
    'startRequest() inside an active bracket request must throw'
  )
  endRequest()
})

test('startRequest() inside an active run(): startRequest() refuses', async () => {
  // startRequest() uses AsyncLocalStorage.enterWith(), which checks
  // the current store regardless of which run() frame set it. So
  // a startRequest() inside an outer run() sees the outer ctx and
  // refuses to nest.
  await run(async () => {
    assert.throws(() => startRequest(), /request context is already active/)
  })
})