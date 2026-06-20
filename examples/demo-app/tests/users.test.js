// T033–T036 — demo app integration tests (US5, SC-004, SC-005)
//
// Exercises the FULL SDK loop end-to-end against the demo app:
// client hits /api/v1/users/:id → server instruments 3 calls (DB, HTTP, LLM)
// → debugger endpoint returns the assembled tree → validate against schema.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

// Top-level: resolve schema files + create the app. No `before()` hook.
const __dirname = dirname(fileURLToPath(import.meta.url))
const contractDir = resolve(__dirname, '../../../specs/001-phase1-sdk-foundation/contracts')
const successSchema = JSON.parse(readFileSync(resolve(contractDir, 'api-debugger-response.schema.json'), 'utf8'))
const errorSchema = JSON.parse(readFileSync(resolve(contractDir, 'api-debugger-error.schema.json'), 'utf8'))
const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validateSuccess = ajv.compile(successSchema)
const validateError = ajv.compile(errorSchema)

const { createApp } = await import('../src/server.js')
const app = createApp()

test('US5 demo: GET /api/v1/users/:id returns 200 + user JSON + X-ApiSpy-RequestId', async () => {
  const res = await request(app).get('/api/v1/users/42')
  assert.equal(res.status, 200)
  assert.match(res.headers['x-apispy-requestid'], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  assert.equal(res.body.id, '42')
  assert.ok(res.body.name, 'response must include a name field')
  assert.ok(res.body.summary, 'response must include the LLM summary')
})

test('US5 demo: after /users call, /apiDebugger/:id returns 3 instrumented queries', async () => {
  const usersRes = await request(app).get('/api/v1/users/42')
  const id = usersRes.headers['x-apispy-requestid']
  const dbgRes = await request(app).get(`/api/v1/apiDebugger/${id}`)
  assert.equal(dbgRes.status, 200)
  assert.ok(validateSuccess(dbgRes.body), 'response must match contract: ' + JSON.stringify(validateSuccess.errors))
  assert.equal(dbgRes.body.queries.length, 3, 'expected exactly 3 instrumented queries')
  const names = dbgRes.body.queries.map(q => q.name)
  assert.ok(names.some(n => n.startsWith('db.')), 'must include a db.* query')
  assert.ok(names.some(n => n.startsWith('http.')), 'must include a http.* query')
  assert.ok(names.some(n => n.startsWith('llm.')), 'must include a llm.* query')
})

test('US5 demo: LLM query carries tokens + cost metadata (your real-world ask)', async () => {
  const usersRes = await request(app).get('/api/v1/users/42')
  const id = usersRes.headers['x-apispy-requestid']
  const dbgRes = await request(app).get(`/api/v1/apiDebugger/${id}`)
  const llm = dbgRes.body.queries.find(q => q.name.startsWith('llm.'))
  assert.ok(llm, 'llm query must exist')
  assert.ok(llm.metadata, 'llm query must have metadata')
  assert.equal(typeof llm.metadata.tokensIn, 'number')
  assert.equal(typeof llm.metadata.tokensOut, 'number')
  assert.equal(typeof llm.metadata.costUsd, 'number')
  assert.ok(llm.metadata.model, 'llm metadata must include model')
})

test('US5 demo: debugger endpoint returns 404 with error schema for unknown id', async () => {
  const res = await request(app).get('/api/v1/apiDebugger/00000000-0000-4000-8000-000000000000')
  assert.equal(res.status, 404)
  assert.ok(validateError(res.body), 'error body must match contract')
  assert.equal(res.body.error, 'not_found')
})

test('US5 demo: debugger endpoint returns 400 for malformed id (too long)', async () => {
  const longId = 'x'.repeat(200)
  const res = await request(app).get(`/api/v1/apiDebugger/${longId}`)
  assert.equal(res.status, 400)
  assert.ok(validateError(res.body), 'error body must match contract')
  assert.equal(res.body.error, 'bad_request')
})

test('US5 demo / SC-004: 100 concurrent requests produce 100 distinct ids, no cross-contamination', async () => {
  const responses = await Promise.all(
    Array.from({ length: 100 }, (_, i) => request(app).get(`/api/v1/users/${i}`))
  )
  const ids = new Set(responses.map(r => r.headers['x-apispy-requestid']))
  assert.equal(ids.size, 100, '100 distinct ids')
  assert.ok(responses.every(r => r.status === 200))

  // For each id, fetch the debugger endpoint and confirm no query from
  // another request leaked in via parentQueryId.
  let crossContamination = 0
  for (const r of responses) {
    const id = r.headers['x-apispy-requestid']
    const dbg = await request(app).get(`/api/v1/apiDebugger/${id}`)
    if (dbg.status !== 200) continue
    for (const q of dbg.body.queries) {
      if (q.parentQueryId !== null && !dbg.body.queries.find(p => p.id === q.parentQueryId)) {
        crossContamination++
      }
    }
  }
  assert.equal(crossContamination, 0, 'no query from one request leaked into another')
})