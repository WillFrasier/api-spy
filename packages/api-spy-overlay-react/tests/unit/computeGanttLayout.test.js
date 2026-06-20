// computeGanttLayout.test.js — TDD for the framework-free Gantt math.
// Spec: specs/003-overlay/data-model.md §Gantt Layout Schema
//
// These tests are pure (no React, no DOM) — they validate the math that
// the GanttChart component will render.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeGanttLayout } from '../../src/lib/computeGanttLayout.js'

const q = (id, name, startMs, durationMs, status = 'ok') => ({
  id,
  name,
  parentQueryId: null,
  startTime: new Date(startMs).toISOString(),
  endTime: new Date(startMs + durationMs).toISOString(),
  durationInMilliseconds: durationMs,
  status,
  error: null,
  metadata: null
})

test('empty input returns empty rows and zero total', () => {
  const layout = computeGanttLayout({ queries: [] })
  assert.deepEqual(layout.rows, [])
  assert.equal(layout.totalDurationMs, 0)
  assert.equal(layout.totalStartTimeMs, 0)
})

test('single query fills the entire timeline', () => {
  const layout = computeGanttLayout({ queries: [q('a', 'db.find', 1000, 200)] })
  assert.equal(layout.totalDurationMs, 200)
  assert.equal(layout.totalStartTimeMs, 1000)
  assert.equal(layout.rows[0].startPercent, 0)
  assert.equal(layout.rows[0].widthPercent, 100)
  assert.equal(layout.rows[0].name, 'db.find')
})

test('two parallel queries share the timeline', () => {
  const queries = [
    q('a', 'db.find', 1000, 200),
    q('b', 'http.fetch', 1000, 200)
  ]
  const layout = computeGanttLayout({ queries })
  assert.equal(layout.totalDurationMs, 200)
  // both rows have startPercent 0 and widthPercent 100
  for (const row of layout.rows) {
    assert.equal(row.startPercent, 0)
    assert.equal(row.widthPercent, 100)
  }
})

test('two serial queries: second starts where first ends', () => {
  const queries = [
    q('a', 'db.find', 1000, 100),   // 1000 -> 1100
    q('b', 'http.fetch', 1100, 100) // 1100 -> 1200
  ]
  const layout = computeGanttLayout({ queries })
  assert.equal(layout.totalDurationMs, 200)
  assert.equal(layout.totalStartTimeMs, 1000)
  assert.equal(layout.rows[0].startPercent, 0)
  assert.equal(layout.rows[0].widthPercent, 50)
  assert.equal(layout.rows[1].startPercent, 50)
  assert.equal(layout.rows[1].widthPercent, 50)
})

test('overlapping queries are correctly positioned', () => {
  // db.find: 1000 -> 1200
  // http.fetch: 1100 -> 1300 (overlaps)
  const queries = [
    q('a', 'db.find', 1000, 200),
    q('b', 'http.fetch', 1100, 200)
  ]
  const layout = computeGanttLayout({ queries })
  // total span is 1000 -> 1300 = 300ms
  assert.equal(layout.totalDurationMs, 300)
  // db.find: starts at 0%, width = 200/300 = 66.666... -> 66.7
  assert.equal(layout.rows[0].startPercent, 0)
  assert.equal(layout.rows[0].widthPercent, 66.7)
  // http.fetch: starts at 100/300 = 33.333... -> 33.3, width = 200/300 = 66.7
  assert.equal(layout.rows[1].startPercent, 33.3)
  assert.equal(layout.rows[1].widthPercent, 66.7)
})

test('sub-millisecond query gets minimum 0.5% width', () => {
  const queries = [
    q('a', 'db.find', 1000, 1000),
    q('b', 'cache.hit', 1500, 0)   // 0ms — would round to 0%
  ]
  const layout = computeGanttLayout({ queries })
  const cacheRow = layout.rows.find(r => r.name === 'cache.hit')
  assert.equal(cacheRow.widthPercent, 0.5)
})

test('negative start is clamped to 0', () => {
  // query starts before the inferred totalStartTime
  const queries = [
    q('a', 'db.find', 900, 200),   // ends at 1100
    q('b', 'http.fetch', 1000, 200) // ends at 1200
  ]
  const layout = computeGanttLayout({ queries })
  // totalStartTimeMs will be 900 (earliest)
  assert.equal(layout.totalStartTimeMs, 900)
  const a = layout.rows.find(r => r.name === 'db.find')
  assert.equal(a.startPercent, 0) // clamped
})

test('errored query is reported as status=error', () => {
  const queries = [
    q('a', 'db.find', 1000, 100, 'error')
  ]
  const layout = computeGanttLayout({ queries })
  assert.equal(layout.rows[0].status, 'error')
})

test('explicit totalDurationMs is honored', () => {
  const queries = [
    q('a', 'db.find', 1000, 100)
  ]
  // pass totalDurationMs=400 even though query is 100ms
  const layout = computeGanttLayout({ queries, totalDurationMs: 400 })
  assert.equal(layout.totalDurationMs, 400)
  // query is 100/400 = 25%
  assert.equal(layout.rows[0].widthPercent, 25)
})

test('result is deterministic for a given input', () => {
  const queries = [
    q('a', 'db.find', 1000, 100),
    q('b', 'http.fetch', 1050, 50)
  ]
  const a = computeGanttLayout({ queries })
  const b = computeGanttLayout({ queries })
  assert.deepEqual(a, b)
})
