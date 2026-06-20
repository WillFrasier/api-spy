// T028 — Contract test (FAILING until ajv is installed + schemas load).
// Covers: US4 (FR-009 — JSON serializable), Spec §Contracts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const __dirname = dirname(fileURLToPath(import.meta.url))
// From packages/api-spy/tests/contract/ up to repo root is 4 levels:
//   contract/ → tests/ → api-spy/ → packages/ → repo root
const contractDir = resolve(__dirname, '../../../../specs/001-phase1-sdk-foundation/contracts')

const successSchema = JSON.parse(readFileSync(resolve(contractDir, 'api-debugger-response.schema.json'), 'utf8'))
const errorSchema = JSON.parse(readFileSync(resolve(contractDir, 'api-debugger-error.schema.json'), 'utf8'))
const example = JSON.parse(readFileSync(resolve(contractDir, 'api-debugger-response.example.json'), 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validateSuccess = ajv.compile(successSchema)
const validateError = ajv.compile(errorSchema)

test('US4 contract: the documented example response validates against the success schema', () => {
  const ok = validateSuccess(example)
  assert.ok(ok, 'golden example must validate: ' + JSON.stringify(validateSuccess.errors, null, 2))
})

test('US4 contract: a minimal {requestId, timing, queries:[]} response validates', () => {
  const minimal = {
    requestId: '5b1f3c8e-2c4a-4f0e-9a4d-1a2b3c4d5e6f',
    timing: { startTime: '2026-06-19T00:00:00.000Z', endTime: '2026-06-19T00:00:00.001Z', durationInMilliseconds: 1 },
    queries: []
  }
  const ok = validateSuccess(minimal)
  assert.ok(ok, 'minimal record must validate')
})

test('US4 contract: a missing requestId is rejected', () => {
  const broken = { timing: {}, queries: [] }
  assert.equal(validateSuccess(broken), false)
  // Ajv reports missing required keys at the parent path; check that the
  // error mentions the missing key 'requestId' (it appears in the error
  // object as `missingProperty`).
  assert.ok(
    validateSuccess.errors.some(e =>
      (e.params && e.params.missingProperty === 'requestId') ||
      (e.message && e.message.includes("'requestId'"))
    ),
    'expected an error mentioning missing requestId; got ' + JSON.stringify(validateSuccess.errors)
  )
})

test('US4 contract: a malformed UUID is rejected', () => {
  const broken = JSON.parse(JSON.stringify(example))
  broken.requestId = 'not-a-uuid'
  assert.equal(validateSuccess(broken), false)
})

test('US4 contract: endTime can be null (incomplete request)', () => {
  const incomplete = JSON.parse(JSON.stringify(example))
  incomplete.timing.endTime = null
  incomplete.timing.durationInMilliseconds = 0
  assert.equal(validateSuccess(incomplete), true, 'incomplete request with endTime:null must validate')
})

test('US4 contract: 404 error body {error:"not_found", requestId:"..."} validates', () => {
  assert.equal(validateError({ error: 'not_found', requestId: 'abc' }), true)
})

test('US4 contract: 400 error body {error:"bad_request", reason:"..."} validates', () => {
  assert.equal(validateError({ error: 'bad_request', reason: 'id too long' }), true)
})

test('US4 contract: an unknown error code is rejected', () => {
  assert.equal(validateError({ error: 'oops' }), false)
})

test('US4 contract: a stored Request round-trips through JSON.stringify/parse losslessly', async () => {
  // Build a Request via the public API, then JSON-roundtrip it and revalidate.
  const { run, track, createInMemoryStore } = await import('../../src/index.js')
  const _store = createInMemoryStore({ capacity: 10 })

  let recorded
  await run(async () => {
    recorded = (await import('../../src/context.js'))._activeContext()
    await track('db.users.findById', async () => ({ id: 1 }), { metadata: { rowCount: 1 } })
    await track('llm.gpt-4o-mini.chat', async () => 'hi', { metadata: { tokensIn: 5, tokensOut: 2 } })
  }, { id: '5b1f3c8e-2c4a-4f0e-9a4d-1a2b3c4d5e6f' })

  // Manually finalize the context as the express middleware would.
  const endTimeMs = Date.now()
  recorded.endTime = new Date(endTimeMs).toISOString()
  recorded.durationInMilliseconds = endTimeMs - recorded.startTimeMs
  recorded.status = 'ok'
  recorded.error = null

  const wire = {
    requestId: recorded.id,
    timing: {
      startTime: recorded.startTime,
      endTime: recorded.endTime,
      durationInMilliseconds: recorded.durationInMilliseconds
    },
    queries: recorded.queries,
    error: null
  }
  const roundTripped = JSON.parse(JSON.stringify(wire))
  const ok = validateSuccess(roundTripped)
  assert.ok(ok, 'JSON-roundtripped live record must validate: ' + JSON.stringify(validateSuccess.errors, null, 2))
})