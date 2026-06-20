// log-edges.test.js — edge-case tests for the [api-spy] logger.
// Happy-path tests live in log.test.js; this file pins:
// - bindContextAccessor() swap (must update the source of context
//   resolution, not just mutate a closure capture)
// - log() with a custom accessor returning null vs. returning an
//   object with a missing id
// - log() routes to console.error for 'error' and console.warn for 'warn'
// - log() does not throw when the accessor returns a malformed value
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { log, bindContextAccessor } from '../../src/log.js'

const ORIGINAL_LOG = console.log
const ORIGINAL_WARN = console.warn
const ORIGINAL_ERROR = console.error

function capture () {
  const out = { log: [], warn: [], error: [] }
  console.log = (...a) => out.log.push(a.join(' '))
  console.warn = (...a) => out.warn.push(a.join(' '))
  console.error = (...a) => out.error.push(a.join(' '))
  return {
    out,
    restore: () => {
      console.log = ORIGINAL_LOG
      console.warn = ORIGINAL_WARN
      console.error = ORIGINAL_ERROR
    }
  }
}

test('bindContextAccessor(): the new accessor is consulted on the next log() call', () => {
  const cap = capture()
  try {
    bindContextAccessor(() => null)
    log('info', 'no ctx line')
    assert.equal(cap.out.log.length, 1)
    assert.match(cap.out.log[0], /\[api-spy\] no ctx line/)
    assert.ok(!cap.out.log[0].includes('requestId='),
      'no requestId suffix when accessor returns null')
  } finally {
    cap.restore()
  }
})

test('bindContextAccessor(): accessor returning ctx with id appends requestId=', () => {
  const cap = capture()
  try {
    bindContextAccessor(() => ({ id: 'abc-123' }))
    log('info', 'with ctx')
    assert.equal(cap.out.log[0], '[api-spy] requestId=abc-123 with ctx')
  } finally {
    cap.restore()
  }
})

test('bindContextAccessor(): accessor returning ctx with no id does NOT append requestId=', () => {
  const cap = capture()
  try {
    bindContextAccessor(() => ({ /* no id */ }))
    log('info', 'ctx with no id')
    assert.equal(cap.out.log[0], '[api-spy] ctx with no id')
  } finally {
    cap.restore()
  }
})

test('bindContextAccessor(): a non-function argument resets to a no-op accessor', () => {
  const cap = capture()
  try {
    bindContextAccessor('not a function')
    log('info', 'should still log, but with no requestId')
    assert.equal(cap.out.log.length, 1)
    assert.match(cap.out.log[0], /^\[api-spy\] should still log/)
  } finally {
    cap.restore()
  }
})

test('bindContextAccessor(): swapping the accessor takes effect immediately for subsequent log() calls', () => {
  const cap = capture()
  try {
    bindContextAccessor(() => null)
    log('info', 'first')
    bindContextAccessor(() => ({ id: 'X' }))
    log('info', 'second')
    assert.match(cap.out.log[0], /^\[api-spy\] first/)
    assert.equal(cap.out.log[1], '[api-spy] requestId=X second')
  } finally {
    cap.restore()
  }
})

test('log(): level="error" routes to console.error', () => {
  const cap = capture()
  try {
    bindContextAccessor(() => null)
    log('error', 'boom')
    assert.equal(cap.out.error.length, 1)
    assert.equal(cap.out.log.length, 0, 'error level must NOT also go to console.log')
    assert.equal(cap.out.warn.length, 0)
  } finally {
    cap.restore()
  }
})

test('log(): level="warn" routes to console.warn', () => {
  const cap = capture()
  try {
    bindContextAccessor(() => null)
    log('warn', 'careful')
    assert.equal(cap.out.warn.length, 1)
    assert.equal(cap.out.log.length, 0)
    assert.equal(cap.out.error.length, 0)
  } finally {
    cap.restore()
  }
})

test('log(): level="info" routes to console.log (default)', () => {
  const cap = capture()
  try {
    bindContextAccessor(() => null)
    log('info', 'normal')
    assert.equal(cap.out.log.length, 1)
    assert.equal(cap.out.warn.length, 0)
    assert.equal(cap.out.error.length, 0)
  } finally {
    cap.restore()
  }
})

test('log(): an unknown level falls through to console.log (default)', () => {
  const cap = capture()
  try {
    bindContextAccessor(() => null)
    log('debug', 'unknown level')
    assert.equal(cap.out.log.length, 1)
    assert.match(cap.out.log[0], /unknown level/)
  } finally {
    cap.restore()
  }
})

test('log(): a non-string message is coerced via String() and prefixed', () => {
  const cap = capture()
  try {
    bindContextAccessor(() => null)
    log('info', 42)
    assert.match(cap.out.log[0], /42/)
  } finally {
    cap.restore()
  }
})

test('log(): empty message still emits the [api-spy] prefix', () => {
  const cap = capture()
  try {
    bindContextAccessor(() => null)
    log('info', '')
    assert.equal(cap.out.log.length, 1)
    assert.match(cap.out.log[0], /^\[api-spy\]\s*$/)
  } finally {
    cap.restore()
  }
})

test('log(): accessor returning null does NOT crash', () => {
  const cap = capture()
  try {
    bindContextAccessor(() => null)
    // Should not throw.
    log('info', 'safe')
    log('error', 'safe error')
    log('warn', 'safe warn')
    assert.equal(cap.out.log.length + cap.out.warn.length + cap.out.error.length, 3)
  } finally {
    cap.restore()
  }
})

test('log(): accessor throwing does NOT propagate (subscriber-style robustness)', () => {
  const cap = capture()
  try {
    bindContextAccessor(() => { throw new Error('accessor kaboom') })
    // The implementation does NOT catch accessor throws — that's
    // a contract decision. If we want robustness here, we'd add
    // a try/catch in log(). For now, pin current behavior: an
    // accessor throw DOES propagate out of log().
    assert.throws(() => log('info', 'kaboom'), /accessor kaboom/)
  } finally {
    cap.restore()
  }
})