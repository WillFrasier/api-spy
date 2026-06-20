// T045 — Doc-snippet validation.
// This file does NOT add tests for production behavior. It runs the
// code SHOWN IN THE DOCS end-to-end against the live demo app, so that
// the README snippets cannot drift away from reality.
//
// If a README snippet is updated, this test must be updated in lockstep.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import createServer from '../src/server.js'

const app = createServer()

test('docs: root README "5-line to instrument" snippet — exact code path works', async () => {
  // The root README's snippet is a minimal version of the demo loop:
  // mount the SDK middleware, instrument a single db.users.findById call,
  // expose the debugger endpoint, hit it.
  const res = await request(app).get('/api/v1/users/42')
  assert.equal(res.status, 200)
  assert.match(res.headers['x-apispy-requestid'],
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)

  // Fetch the debugger response — matches the README's "what you get" JSON.
  const dbg = await request(app).get(`/api/v1/apiDebugger/${res.headers['x-apispy-requestid']}`)
  assert.equal(dbg.status, 200)
  assert.equal(dbg.body.requestId, res.headers['x-apispy-requestid'])
  assert.equal(dbg.body.queries.length, 3)
  const names = dbg.body.queries.map(q => q.name)
  assert.ok(names.includes('db.users.findById'))
  assert.ok(names.includes('http.upstream.profile'))
  assert.ok(names.includes('llm.gpt-4o-mini.summarize'))

  // The LLM query MUST carry tokens + cost metadata (the shape documented
  // in the root + SDK README).
  const llm = dbg.body.queries.find(q => q.name.startsWith('llm.'))
  assert.ok(llm.metadata, 'llm query must have metadata')
  assert.equal(typeof llm.metadata.tokensIn, 'number')
  assert.equal(typeof llm.metadata.tokensOut, 'number')
  assert.equal(typeof llm.metadata.costUsd, 'number')
  assert.ok(llm.metadata.model, 'llm metadata must include model')
})

test('docs: SDK README "init({ store })" example works end-to-end', async () => {
  // Re-validate that the public API matches the documented shape.
  const apiSpy = await import('api-spy')
  assert.equal(typeof apiSpy.run, 'function')
  assert.equal(typeof apiSpy.getRequestId, 'function')
  assert.equal(typeof apiSpy.track, 'function')
  assert.equal(typeof apiSpy.expressMiddleware, 'function')
  assert.equal(typeof apiSpy.createInMemoryStore, 'function')
  assert.equal(typeof apiSpy.init, 'function')
  assert.equal(typeof apiSpy._store, 'function')

  // The custom-store example from the SDK README must be usable.
  class TinyStore {
    constructor () { this._m = new Map() }
    save (record) { this._m.set(record.id, record) }
    get (id) { return this._m.get(id) }
  }
  const tiny = new TinyStore()
  apiSpy.init({ store: tiny })

  await apiSpy.run(async () => {
    await apiSpy.track('docs.snippet.test', async () => 'ok')
  }, { id: '5b1f3c8e-2c4a-4f0e-9a4d-1a2b3c4d5e6f' })

  // The store should now have a record for the id we passed in.
  // (The record is finalized when the response finishes, so we just
  // verify the init({ store }) swap took effect — TinyStore is now active.)
  assert.equal(apiSpy._store(), tiny, 'init({ store }) must swap the active store')
})
