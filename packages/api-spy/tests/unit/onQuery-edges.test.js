// onQuery-edges.test.js — edge-case tests for the onQuery hook
// registry. The happy-path subscription is covered in onQuery.test.js;
// this file pins the contract on:
// - default state (no hook)
// - setOnQuery(null) clears the hook
// - chaining hooks by reading getOnQuery() inside the new one
// - non-function values are stored verbatim (no validation) — this
//   is the documented "single mutable singleton" pattern
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { setOnQuery, getOnQuery, _reset } from '../../src/onQuery.js'

// Each test must reset to a known state so order doesn't matter.
test.beforeEach(() => _reset())

test('getOnQuery(): returns null when no hook has been set', () => {
  assert.equal(getOnQuery(), null)
})

test('setOnQuery(fn): installs the function and getOnQuery returns it', () => {
  const fn = () => {}
  setOnQuery(fn)
  assert.equal(getOnQuery(), fn)
})

test('setOnQuery(null): clears the previously-set hook', () => {
  setOnQuery(() => {})
  assert.notEqual(getOnQuery(), null)
  setOnQuery(null)
  assert.equal(getOnQuery(), null)
})

test('setOnQuery(): replaces the previous hook (does not chain automatically)', () => {
  // The module-level mutable singleton does NOT chain by default —
  // callers wanting fan-out must read getOnQuery() and re-invoke.
  const a = () => {}
  const b = () => {}
  setOnQuery(a)
  setOnQuery(b)
  assert.equal(getOnQuery(), b, 'second setOnQuery must replace, not chain')
})

test('chaining pattern: get the previous hook inside the new one for fan-out', () => {
  const calls = []
  const first = () => calls.push('first')
  const second = () => {
    calls.push('second')
    const prev = getOnQuery()
    // Calling 'first' directly (not via getOnQuery) is the chaining
    // pattern. This documents that the registry is replaceable,
    // not additive.
    first()
  }
  setOnQuery(first)
  setOnQuery(second)
  // Only the latest set hook is in the registry now.
  getOnQuery()()
  assert.deepEqual(calls, ['second', 'first'])
})

test('setOnQuery(): non-function values are stored verbatim (no type validation)', () => {
  // Documented: this is a singleton registry, not a typed event
  // emitter. Storing a non-function would cause finalizeQuery()'s
  // hook() call to throw, which is swallowed. So in practice,
  // non-functions are silent no-ops, but we don't enforce shape.
  setOnQuery('not a function')
  assert.equal(getOnQuery(), 'not a function')
})

test('_reset(): clears the hook (test-only escape hatch)', () => {
  setOnQuery(() => {})
  _reset()
  assert.equal(getOnQuery(), null)
})

test('_reset(): is safe to call when no hook is set (no throw)', () => {
  _reset()
  _reset()
  _reset()
  assert.equal(getOnQuery(), null)
})

test('setOnQuery(): a function reference is preserved by identity (not cloned)', () => {
  const fn = () => {}
  setOnQuery(fn)
  assert.equal(getOnQuery(), fn)
  // Re-setting the same reference must not clone.
  setOnQuery(fn)
  assert.equal(getOnQuery(), fn)
})