// T007 — log module unit tests (FAILING — implementation does not exist yet)
// Covers: FR-012 (single log line on init), data-model §log prefix
import { test } from 'node:test'
import assert from 'node:assert/strict'

// We import lazily inside each test so a missing module produces a clean
// "Cannot find module" error rather than a top-level crash. Once the SDK
// implements src/log.js, these will resolve.

test('log() emits lines prefixed with [api-spy]', async () => {
  const { log } = await import('../../src/log.js')
  const captured = []
  const original = console.log
  console.log = (...args) => captured.push(args.join(' '))
  try {
    log('info', 'hello world')
  } finally {
    console.log = original
  }
  assert.equal(captured.length, 1, 'log() should emit exactly one line')
  assert.match(captured[0], /^\[api-spy\]/, 'line must start with [api-spy]')
})

test('log() includes requestId when called inside a request context', async () => {
  const { log } = await import('../../src/log.js')
  const { run } = await import('../../src/context.js')

  const captured = []
  const original = console.log
  console.log = (...args) => captured.push(args.join(' '))
  try {
    await run(async () => {
      log('info', 'inner')
    })
    log('info', 'outer')
  } finally {
    console.log = original
  }

  assert.equal(captured.length, 2)
  // Inner call MUST carry requestId=<uuid>
  assert.match(captured[0], /requestId=[0-9a-f-]{36}/, 'inner log must include requestId')
  // Outer call MUST NOT carry requestId
  assert.doesNotMatch(captured[1], /requestId=/, 'outer log must NOT include requestId')
})

test('log() does not throw when context module is not initialized', async () => {
  const { log } = await import('../../src/log.js')
  // No setup. log() must still work.
  assert.doesNotThrow(() => log('info', 'no context'))
})

test('log() respects the level argument by mapping to console.X', async () => {
  const { log } = await import('../../src/log.js')
  // We assert by stubbing console.error and console.warn and ensuring the
  // routing is right. info stays on console.log per the existing contract.
  const errs = []
  const warns = []
  const origErr = console.error
  const origWarn = console.warn
  console.error = (...a) => errs.push(a.join(' '))
  console.warn = (...a) => warns.push(a.join(' '))
  try {
    log('error', 'boom')
    log('warn', 'careful')
  } finally {
    console.error = origErr
    console.warn = origWarn
  }
  assert.equal(errs.length, 1)
  assert.equal(warns.length, 1)
  assert.match(errs[0], /^\[api-spy\]/)
  assert.match(warns[0], /^\[api-spy\]/)
})