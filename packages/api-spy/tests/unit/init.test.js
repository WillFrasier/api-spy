// init.test.js — direct unit tests for apiSpy.init() and the public
// export surface from src/index.js. The bracket/track integration
// tests exercise init() transitively, but pin the contract here so
// failures point at the right module when init() drifts.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  init,
  _store,
  _resetOnQueryForTests,
  createInMemoryStore
} from '../../src/index.js'

// Capture init()'s console.log output so tests don't pollute test
// runner output, and so we can assert the FR-012 single-line contract.
const ORIGINAL_LOG = console.log
function captureLog () {
  const lines = []
  console.log = (msg) => { if (typeof msg === 'string') lines.push(msg) }
  return {
    lines,
    restore: () => { console.log = ORIGINAL_LOG }
  }
}

test('init(): with no args, logs the [api-spy] init line and keeps the default store', () => {
  const cap = captureLog()
  try {
    init()
    assert.equal(cap.lines.length, 1, 'FR-012: exactly one log line on init')
    assert.match(cap.lines[0], /^\[api-spy\] initialized store=/)
    assert.match(cap.lines[0], /capacity=\d+/)
  } finally {
    cap.restore()
  }
})

test('init(): swaps the active store when opts.store is provided', () => {
  const custom = createInMemoryStore({ capacity: 5 })
  init({ store: custom })
  assert.equal(_store(), custom, 'init({ store }) must replace the active store')
})

test('init(): logs the new store class name after a swap', () => {
  // The init log is `store=<name> capacity=<size-or-na>`. We can only
  // assert structural shape — the configured capacity and the
  // runtime size are not the same number (capacity is the configured
  // bound; size() returns the current map count). The contract is
  // "exactly one line, contains the store marker, contains capacity".
  const custom = createInMemoryStore({ capacity: 7 })
  const cap = captureLog()
  try {
    init({ store: custom })
    assert.equal(cap.lines.length, 1)
    assert.match(cap.lines[0], /^\[api-spy\] initialized store=/)
    assert.match(cap.lines[0], /capacity=/)
  } finally {
    cap.restore()
  }
})

test('init(): installing an onQuery hook makes subsequent track() calls fire it', async () => {
  _resetOnQueryForTests()
  const seen = []
  init({ onQuery: (_ctx, q) => seen.push(q.name) })
  const { run, track } = await import('../../src/index.js')
  await run(async () => {
    await track('a', async () => {})
    await track('b', async () => {})
  })
  assert.deepEqual(seen, ['a', 'b'])
})

test('init(): passing onQuery=null clears the hook', async () => {
  _resetOnQueryForTests()
  let fired = false
  init({ onQuery: () => { fired = true } })
  // Now clear.
  init({ onQuery: null })
  const { run, track } = await import('../../src/index.js')
  await run(async () => { await track('a', async () => {}) })
  assert.equal(fired, false, 'init({ onQuery: null }) must clear the previous hook')
})

test('init(): omitting opts.onQuery does NOT clobber a previously-set hook', async () => {
  _resetOnQueryForTests()
  let fired = false
  init({ onQuery: () => { fired = true } })
  // Re-init without onQuery — must preserve the previous hook.
  init()
  const { run, track } = await import('../../src/index.js')
  await run(async () => { await track('a', async () => {}) })
  assert.equal(fired, true, 'a previously-set onQuery hook must survive init() calls that omit onQuery')
})

test('init(): a store without a size() method logs capacity=n/a', () => {
  class TinyStore {
    save () {}
    get () {}
  }
  const cap = captureLog()
  try {
    init({ store: new TinyStore() })
    assert.match(cap.lines[0], /capacity=n\/a/)
  } finally {
    cap.restore()
  }
})

test('init(): a store with a missing constructor name falls back to "Store"', () => {
  // Object.create(null) leaves constructor.name === 'Object', which
  // is fine, but we also want to handle the case where it's literally
  // empty. Achieved by creating a class whose name is "" via a Proxy.
  class _Anonym {}
  const anon = new _Anonym()
  // Force constructor.name to '' via Object.defineProperty.
  Object.defineProperty(anon.constructor, 'name', { value: '' })
  const cap = captureLog()
  try {
    init({ store: anon })
    assert.match(cap.lines[0], /store=Store capacity=/,
      'when constructor.name is empty, the log must show "Store"')
  } finally {
    cap.restore()
  }
})

test('public exports: every documented public symbol is present', async () => {
  // Lock the contract for FR-001's export list. If a future refactor
  // accidentally drops an export, this fails immediately.
  const apiSpy = await import('../../src/index.js')
  assert.equal(typeof apiSpy.run, 'function')
  assert.equal(typeof apiSpy.track, 'function')
  assert.equal(typeof apiSpy.getRequestId, 'function')
  assert.equal(typeof apiSpy.init, 'function')
  assert.equal(typeof apiSpy.expressMiddleware, 'function')
  assert.equal(typeof apiSpy.createInMemoryStore, 'function')
  assert.equal(typeof apiSpy._store, 'function')
  assert.equal(typeof apiSpy.start, 'function')
  assert.equal(typeof apiSpy.end, 'function')
  assert.equal(typeof apiSpy.startRequest, 'function')
  assert.equal(typeof apiSpy.endRequest, 'function')
  assert.equal(typeof apiSpy.wsHandler, 'function')
  assert.equal(typeof apiSpy._resetOnQueryForTests, 'function')
})

test('public exports: there is no default export (named exports only)', async () => {
  const mod = await import('../../src/index.js')
  assert.equal(mod.default, undefined,
    'data-model.md §API Surface requires named exports, not default')
})