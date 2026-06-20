// T023–T026 — Express middleware integration tests (FAILING — stub only)
// Covers: US3 (FR-006), Spec §Edge Cases (header overwrite)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import * as apiSpy from '../../src/index.js'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function buildApp (routeFn) {
  const app = express()
  app.use(apiSpy.expressMiddleware())
  app.get('/probe', routeFn)
  return app
}

test('US3 express middleware: every response carries X-ApiSpy-RequestId matching UUID v4', async () => {
  const app = buildApp((req, res) => res.json({ id: apiSpy.getRequestId() }))
  const res = await request(app).get('/probe')
  assert.equal(res.status, 200)
  assert.match(res.headers['x-apispy-requestid'], UUID_V4)
})

test('US3 express middleware: route handler getRequestId() equals the response header', async () => {
  let inHandler
  const app = buildApp((req, res) => { inHandler = apiSpy.getRequestId(); res.json({}) })
  const res = await request(app).get('/probe')
  assert.equal(res.headers['x-apispy-requestid'], inHandler, 'handler id must match response header')
})

test('US3 express middleware: two parallel requests get distinct ids (no cross-contamination)', async () => {
  const seen = new Map()
  const app = express()
  app.use(apiSpy.expressMiddleware())
  app.get('/probe', async (req, res) => {
    const id = apiSpy.getRequestId()
    // Yield to interleave requests.
    await new Promise((r) => setTimeout(r, 5))
    seen.set(id, (seen.get(id) || 0) + 1)
    assert.equal(apiSpy.getRequestId(), id, 'id must remain stable across awaits')
    res.json({ id })
  })
  const results = await Promise.all([
    request(app).get('/probe'),
    request(app).get('/probe'),
    request(app).get('/probe'),
    request(app).get('/probe'),
    request(app).get('/probe')
  ])
  const ids = results.map(r => r.body.id)
  assert.equal(new Set(ids).size, ids.length, 'all 5 requests got distinct ids')
  for (const id of ids) assert.equal(seen.get(id), 1, `id ${id} was seen exactly once`)
})

test('US3 express middleware: client-supplied X-ApiSpy-RequestId is overwritten', async () => {
  let handlerId
  const app = buildApp((req, res) => { handlerId = apiSpy.getRequestId(); res.json({}) })
  const malicious = 'attacker-controlled-id-12345'
  const res = await request(app)
    .get('/probe')
    .set('X-ApiSpy-RequestId', malicious)
  assert.notEqual(res.headers['x-apispy-requestid'], malicious, 'middleware must overwrite client header')
  assert.match(res.headers['x-apispy-requestid'], UUID_V4)
  assert.equal(res.headers['x-apispy-requestid'], handlerId)
})

test('US3 express middleware: track() inside the route is recorded under the request id', async () => {
  const app = buildApp(async (req, res) => {
    await apiSpy.track('inside.handler', async () => {
      await new Promise((r) => setTimeout(r, 5))
      return 'done'
    })
    res.json({ ok: true })
  })
  const res = await request(app).get('/probe')
  assert.equal(res.status, 200)
  // Fetch the recorded tree via _store
  const record = apiSpy._store().get(res.headers['x-apispy-requestid'])
  assert.ok(record, 'a record should be saved for the request id')
  assert.equal(record.queries.length, 1)
  assert.equal(record.queries[0].name, 'inside.handler')
  assert.equal(record.queries[0].status, 'ok')
})

test('US3 express middleware: route that throws still records the request as errored', async () => {
  const app = express()
  app.use(apiSpy.expressMiddleware())
  app.get('/probe', async (req, res, next) => {
    try {
      await apiSpy.track('boom', async () => { throw new Error('route exploded') })
    } catch (err) {
      return next(err)
    }
  })
  app.use((err, req, res, _next) => {
    res.status(500).json({ error: err.message })
  })
  const res = await request(app).get('/probe')
  assert.equal(res.status, 500)
  const record = apiSpy._store().get(res.headers['x-apispy-requestid'])
  assert.ok(record, 'record must be saved even when the route threw')
  assert.equal(record.queries.length, 1)
  assert.equal(record.queries[0].status, 'error')
  assert.match(record.queries[0].error.message, /route exploded/)
})

test('US3 express middleware: route catches a track() throw and returns 200 — request is still marked errored because a child query errored', async () => {
  // This is the regression test for the "child errored but HTTP layer is ok" case.
  // The demo's /scenarios/error route returns 503, but consider a route that
  // catches the inner failure and returns 200 anyway (graceful degradation).
  // The developer's first signal that something went wrong is the request
  // badge — it must be red, not green.
  const app = express()
  app.use(apiSpy.expressMiddleware())
  app.get('/probe', async (req, res, _next) => {
    try {
      await apiSpy.track('flaky.upstream', async () => {
        throw new Error('upstream 503')
      })
    } catch {
      // Swallow the error and return a degraded response.
      return res.json({ ok: true, degraded: true })
    }
  })
  const res = await request(app).get('/probe')
  assert.equal(res.status, 200, 'route returns 200 — degraded but successful')
  const record = apiSpy._store().get(res.headers['x-apispy-requestid'])
  assert.ok(record, 'record must be saved')
  assert.equal(record.status, 'error', 'request status must be "error" because a child query errored, even though HTTP layer returned 200')
  assert.equal(record.queries.length, 1)
  assert.equal(record.queries[0].status, 'error')
})

test('US3 express middleware: 401 response with zero queries is marked errored (auth guard case)', async () => {
  // Routes that fail before any backend work — e.g. an auth guard that
  // returns 401 — must still surface as status=error in the overlay.
  // The developer needs to see "this request failed" regardless of
  // whether anything was instrumented.
  const app = express()
  app.use(apiSpy.expressMiddleware())
  app.get('/probe', (_req, _res, next) => {
    const err = new Error('missing or invalid auth token')
    err.status = 401
    next(err)
  })
  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message })
  })
  const res = await request(app).get('/probe')
  assert.equal(res.status, 401)
  const record = apiSpy._store().get(res.headers['x-apispy-requestid'])
  assert.ok(record)
  assert.equal(record.status, 'error', '401 response with no queries must be marked errored')
})

test('US3 express middleware: 100 concurrent requests produce 100 distinct ids and 100 records', async () => {
  const app = buildApp((req, res) => res.json({ id: apiSpy.getRequestId() }))
  const responses = await Promise.all(
    Array.from({ length: 100 }, () => request(app).get('/probe'))
  )
  const ids = new Set(responses.map(r => r.headers['x-apispy-requestid']))
  assert.equal(ids.size, 100, '100 distinct ids')
  // Each id should have a record in the store (100 unique ids × 1 record each).
  let found = 0
  for (const id of ids) if (apiSpy._store().get(id)) found++
  assert.ok(found >= 95, `at least 95 of 100 ids must have records (LRU may evict under load), got ${found}`)
})
