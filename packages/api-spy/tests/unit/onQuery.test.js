// onQuery.test.js — TDD for the init({ onQuery }) hook.
// Spec: specs/003-overlay/spec.md §FR-001.
// The hook fires after each track() finalizes (success or error), and
// is the seam the wsHandler() subscribes to.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { run, track, init, _resetOnQueryForTests } from 'api-spy'

test('onQuery is invoked after each track() call completes', () => {
  _resetOnQueryForTests()
  const calls = []
  init({ onQuery: (ctx, query) => calls.push({ requestId: ctx?.id, name: query.name }) })
  return run(async () => {
    await track('a', async () => {})
    await track('b', async () => {})
  }).then(() => {
    assert.equal(calls.length, 2)
    assert.equal(calls[0].name, 'a')
    assert.equal(calls[1].name, 'b')
    assert.equal(typeof calls[0].requestId, 'string')
  })
})

test('onQuery receives errored queries with status=error', () => {
  _resetOnQueryForTests()
  const calls = []
  init({ onQuery: (ctx, query) => calls.push(query) })
  return run(async () => {
    await track('a', async () => { throw new Error('boom') }).catch(() => {})
  }).then(() => {
    assert.equal(calls.length, 1)
    assert.equal(calls[0].status, 'error')
    assert.equal(calls[0].error.message, 'boom')
  })
})

test('onQuery is not invoked if not configured', () => {
  _resetOnQueryForTests()
  return run(async () => {
    await track('a', async () => {})
  })
})

test('onQuery fires inside the active request context', () => {
  _resetOnQueryForTests()
  let observedRequestId = null
  init({ onQuery: (ctx) => { observedRequestId = ctx?.id ?? null } })
  return run(async () => {
    await track('a', async () => {})
  }).then(() => {
    assert.equal(typeof observedRequestId, 'string')
  })
})

test('onQuery fires for track() called outside a run() context (no requestId)', () => {
  _resetOnQueryForTests()
  const calls = []
  init({ onQuery: (ctx, query) => calls.push({ ctx, name: query.name }) })
  return track('a', async () => {}).then(() => {
    assert.equal(calls.length, 1)
    assert.equal(calls[0].name, 'a')
    assert.equal(calls[0].ctx, null)
  })
})

test('subscriber errors do not break track()', () => {
  _resetOnQueryForTests()
  init({ onQuery: () => { throw new Error('subscriber boom') } })
  return run(async () => {
    // Should not throw despite the subscriber error
    const result = await track('a', async () => 'ok')
    assert.equal(result, 'ok')
  })
})
