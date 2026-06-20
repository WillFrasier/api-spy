// T009 — store unit tests (FAILING — implementation does not exist yet)
// Covers: FR-005 (LRU store), Spec §Edge Cases (eviction under capacity)
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('createInMemoryStore(): save + get round-trip', async () => {
  const { createInMemoryStore } = await import('../../src/store.js')
  const store = createInMemoryStore({ capacity: 10 })

  const record = {
    id: 'req-1',
    startTime: '2026-06-19T00:00:00.000Z',
    endTime: '2026-06-19T00:00:00.100Z',
    durationInMilliseconds: 100,
    status: 'ok',
    error: null,
    queries: []
  }
  store.save(record)
  const fetched = store.get('req-1')
  assert.deepEqual(fetched, record)
})

test('createInMemoryStore(): get() returns undefined for unknown ids', async () => {
  const { createInMemoryStore } = await import('../../src/store.js')
  const store = createInMemoryStore({ capacity: 10 })
  assert.equal(store.get('does-not-exist'), undefined)
})

test('createInMemoryStore(): evicts oldest record when capacity is reached', async () => {
  const { createInMemoryStore } = await import('../../src/store.js')
  const capacity = 3
  const store = createInMemoryStore({ capacity })

  const make = (id) => ({
    id,
    startTime: '2026-06-19T00:00:00.000Z',
    endTime: '2026-06-19T00:00:00.001Z',
    durationInMilliseconds: 1,
    status: 'ok',
    error: null,
    queries: []
  })

  // Save capacity records.
  store.save(make('r1'))
  store.save(make('r2'))
  store.save(make('r3'))

  // Insert one more — this should evict r1 (the oldest, never re-read).
  store.save(make('r4'))

  // Note: store.get() has LRU side effects (bumps recency). Use store.size()
  // and a fresh Map inspection via internal state to avoid touching ordering.
  assert.equal(store.size(), 3, 'store must hold exactly capacity records')
  // We can probe each id; the test for each id has its own recency cost but
  // that's fine because we only assert presence/absence below.
  assert.equal(store.get('r1'), undefined, 'r1 must be evicted (was oldest, untouched)')
  assert.equal(store.get('r2').id, 'r2')
  assert.equal(store.get('r3').id, 'r3')
  assert.equal(store.get('r4').id, 'r4')
})

test('createInMemoryStore(): get() bumps LRU recency — does NOT evict a recently-read record', async () => {
  const { createInMemoryStore } = await import('../../src/store.js')
  const capacity = 3
  const store = createInMemoryStore({ capacity })

  const make = (id) => ({
    id, startTime: '2026-06-19T00:00:00.000Z', endTime: '2026-06-19T00:00:00.001Z',
    durationInMilliseconds: 1, status: 'ok', error: null, queries: []
  })
  store.save(make('a'))
  store.save(make('b'))
  store.save(make('c'))

  // Read 'a' — it should now be the most recently used.
  store.get('a')

  // Insert 'd' — 'b' (oldest not-read-recently) should be evicted, NOT 'a'.
  store.save(make('d'))

  assert.equal(store.get('a').id, 'a', 'a must survive because it was recently read')
  assert.equal(store.get('b'), undefined, 'b must be evicted (was oldest unrevisited)')
  assert.equal(store.get('c').id, 'c')
  assert.equal(store.get('d').id, 'd')
})

test('createInMemoryStore(): emits [api-spy] evicted requestId=<id> log on eviction', async () => {
  const { createInMemoryStore } = await import('../../src/store.js')
  const captured = []
  const orig = console.log
  console.log = (...a) => captured.push(a.join(' '))
  try {
    const store = createInMemoryStore({ capacity: 1 })
    store.save({ id: 'first', startTime: '', endTime: '', durationInMilliseconds: 0, status: 'ok', error: null, queries: [] })
    store.save({ id: 'second', startTime: '', endTime: '', durationInMilliseconds: 0, status: 'ok', error: null, queries: [] })
  } finally {
    console.log = orig
  }
  const evictLine = captured.find((line) => line.includes('evicted'))
  assert.ok(evictLine, 'expected an eviction log line')
  assert.match(evictLine, /\[api-spy\]/)
  assert.match(evictLine, /requestId=first/)
})

test('createInMemoryStore(): default capacity is 1000', async () => {
  const { createInMemoryStore } = await import('../../src/store.js')
  const store = createInMemoryStore()
  const make = (i) => ({ id: `id-${i}`, startTime: '', endTime: '', durationInMilliseconds: 0, status: 'ok', error: null, queries: [] })
  // Save 1000 records — none should be evicted yet.
  for (let i = 0; i < 1000; i++) store.save(make(i))
  assert.equal(store.size(), 1000, 'store must hold exactly 1000 records')
  // The 1001st insert evicts id-0 (oldest).
  store.save(make(1000))
  assert.equal(store.get('id-0'), undefined, 'id-0 must be evicted at 1001 inserts')
})