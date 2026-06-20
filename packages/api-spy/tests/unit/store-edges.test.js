// store-edges.test.js — edge-case tests for createInMemoryStore that
// complement store.test.js. Pins the contract on:
// - malformed inputs (null/undefined/non-string id, missing fields)
// - capacity edge cases (0, negative, non-integer)
// - dispose()
// - re-saving the same id (overwrite semantics)
// - size() at every transition
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createInMemoryStore } from '../../src/store.js'

const make = (id, overrides = {}) => ({
  id,
  startTime: '2026-06-19T00:00:00.000Z',
  endTime: '2026-06-19T00:00:00.001Z',
  durationInMilliseconds: 1,
  status: 'ok',
  error: null,
  queries: [],
  ...overrides
})

// ----- Capacity edge cases -----

test('createInMemoryStore(): capacity defaults to 1000', () => {
  const store = createInMemoryStore()
  // 1000 inserts fit, 1001st evicts.
  for (let i = 0; i < 1000; i++) store.save(make(`id-${i}`))
  assert.equal(store.size(), 1000)
})

test('createInMemoryStore(): opts.capacity of 0 is invalid → falls back to default 1000', () => {
  const store = createInMemoryStore({ capacity: 0 })
  // 1000 records still fit (default capacity is 1000, not 0).
  for (let i = 0; i < 1000; i++) store.save(make(`id-${i}`))
  assert.equal(store.size(), 1000)
})

test('createInMemoryStore(): opts.capacity negative is invalid → falls back to default', () => {
  const store = createInMemoryStore({ capacity: -5 })
  for (let i = 0; i < 1000; i++) store.save(make(`id-${i}`))
  assert.equal(store.size(), 1000)
})

test('createInMemoryStore(): opts.capacity non-integer is invalid → falls back to default', () => {
  const store = createInMemoryStore({ capacity: 5.7 })
  for (let i = 0; i < 1000; i++) store.save(make(`id-${i}`))
  assert.equal(store.size(), 1000)
})

test('createInMemoryStore(): opts.capacity = 1 evicts every prior insert on the next save', () => {
  const store = createInMemoryStore({ capacity: 1 })
  store.save(make('a'))
  store.save(make('b'))
  assert.equal(store.get('a'), undefined)
  assert.equal(store.get('b').id, 'b')
  store.save(make('c'))
  assert.equal(store.get('b'), undefined)
  assert.equal(store.get('c').id, 'c')
})

test('createInMemoryStore(): opts.capacity = 2 holds 2 records, evicts on the 3rd', () => {
  const store = createInMemoryStore({ capacity: 2 })
  store.save(make('a'))
  store.save(make('b'))
  assert.equal(store.size(), 2)
  store.save(make('c'))
  assert.equal(store.size(), 2)
  assert.equal(store.get('a'), undefined)
  assert.equal(store.get('b').id, 'b')
  assert.equal(store.get('c').id, 'c')
})

// ----- Save input validation -----

test('createInMemoryStore(): save(null) throws TypeError', () => {
  const store = createInMemoryStore({ capacity: 5 })
  assert.throws(() => store.save(null), TypeError)
})

test('createInMemoryStore(): save(undefined) throws TypeError', () => {
  const store = createInMemoryStore({ capacity: 5 })
  assert.throws(() => store.save(undefined), TypeError)
})

test('createInMemoryStore(): save({}) (no id) throws TypeError', () => {
  const store = createInMemoryStore({ capacity: 5 })
  assert.throws(() => store.save({}), TypeError)
})

test('createInMemoryStore(): save({ id: 123 }) (non-string id) throws TypeError', () => {
  const store = createInMemoryStore({ capacity: 5 })
  assert.throws(() => store.save({ id: 123 }), TypeError)
})

test('createInMemoryStore(): save({ id: "" }) (empty id) throws TypeError', () => {
  const store = createInMemoryStore({ capacity: 5 })
  assert.throws(() => store.save({ id: '' }), TypeError)
})

// ----- Re-save (id overwrite) -----

test('createInMemoryStore(): saving the same id twice overwrites the value', () => {
  const store = createInMemoryStore({ capacity: 5 })
  store.save(make('a', { durationInMilliseconds: 100 }))
  store.save(make('a', { durationInMilliseconds: 200 }))
  assert.equal(store.size(), 1, 'overwrite must not create a second entry')
  const r = store.get('a')
  assert.equal(r.durationInMilliseconds, 200)
})

test('createInMemoryStore(): overwrite bumps recency — newest value is preserved through eviction', () => {
  const store = createInMemoryStore({ capacity: 2 })
  store.save(make('a', { durationInMilliseconds: 100 }))
  store.save(make('b', { durationInMilliseconds: 100 }))
  store.save(make('a', { durationInMilliseconds: 999 }))  // overwrite 'a' — moves to MRU
  store.save(make('c'))  // evicts 'b' (oldest unrevisited)
  assert.equal(store.get('a').durationInMilliseconds, 999, 'a was overwritten with 999')
  assert.equal(store.get('b'), undefined, 'b was evicted, not a')
  assert.equal(store.get('c').id, 'c')
})

// ----- Dispose -----

test('createInMemoryStore(): dispose() clears the store', () => {
  const store = createInMemoryStore({ capacity: 5 })
  store.save(make('a'))
  store.save(make('b'))
  assert.equal(store.size(), 2)
  store.dispose()
  assert.equal(store.size(), 0, 'dispose must empty the store')
  assert.equal(store.get('a'), undefined)
  assert.equal(store.get('b'), undefined)
})

test('createInMemoryStore(): the store is usable again after dispose()', () => {
  const store = createInMemoryStore({ capacity: 5 })
  store.save(make('a'))
  store.dispose()
  store.save(make('b'))
  assert.equal(store.size(), 1)
  assert.equal(store.get('b').id, 'b')
})

// ----- LRU ordering edge cases -----

test('createInMemoryStore(): get() of an unknown id does not throw and returns undefined', () => {
  const store = createInMemoryStore({ capacity: 5 })
  assert.equal(store.get('nope'), undefined)
  assert.equal(store.get(''), undefined)
  assert.equal(store.get(null), undefined)
  assert.equal(store.get(undefined), undefined)
})

test('createInMemoryStore(): many saves interleaved with reads preserve the LRU invariant', () => {
  const store = createInMemoryStore({ capacity: 3 })
  store.save(make('a'))
  store.save(make('b'))
  store.save(make('c'))
  store.get('a')        // 'a' is now MRU; LRU order: b, c, a
  store.get('b')        // 'b' is now MRU; LRU order: c, a, b
  store.save(make('d'))  // evicts 'c' (LRU)
  assert.equal(store.get('c'), undefined, 'c was the LRU and must be evicted')
  assert.equal(store.get('a').id, 'a')
  assert.equal(store.get('b').id, 'b')
  assert.equal(store.get('d').id, 'd')
})

test('createInMemoryStore(): get() bumps recency on a hit (id is moved to the end of insertion order)', () => {
  const store = createInMemoryStore({ capacity: 3 })
  store.save(make('a'))
  store.save(make('b'))
  store.save(make('c'))
  // At this point insertion order is [a, b, c]. c is MRU.
  store.get('a')
  // After get('a'), insertion order is [b, c, a]. a is MRU.
  store.save(make('d'))  // evicts 'b'
  assert.equal(store.get('b'), undefined)
})

// ----- Size accounting -----

test('createInMemoryStore(): size() reflects save() and dispose()', () => {
  const store = createInMemoryStore({ capacity: 100 })
  assert.equal(store.size(), 0)
  store.save(make('a'))
  assert.equal(store.size(), 1)
  store.save(make('b'))
  assert.equal(store.size(), 2)
  store.save(make('a'))  // overwrite — no growth
  assert.equal(store.size(), 2)
  store.dispose()
  assert.equal(store.size(), 0)
})

test('createInMemoryStore(): size() does not exceed capacity', () => {
  const store = createInMemoryStore({ capacity: 5 })
  for (let i = 0; i < 50; i++) store.save(make(`id-${i}`))
  assert.equal(store.size(), 5)
})