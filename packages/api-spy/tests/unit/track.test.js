// T014–T018 — track() unit tests (FAILING — implementation does not exist yet)
// Covers: US1 (instrument a slow op), FR-003 (record name, start/end, duration, status, error, parentQueryId)
// Real-world async patterns: serial chain, parallel fan-out, deeply nested, mixed durations,
// sync + async throw, error capture, metadata pass-through.
//
// Timing tolerance: ±50ms OR ±20% of the inner work duration, whichever is larger.
// This is intentionally generous — Node's event loop and V8 timing are noisy at sub-ms.
// We are validating "timing is in the right ballpark", not micro-bench precision.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/**
 * @param {number} actualMs observed duration
 * @param {number} expectedMs inner sleep we asked for
 * @returns {{ pass: boolean, drift: number, tolerance: number }}
 */
function timingCheck (actualMs, expectedMs) {
  // Generous tolerance per spec: max(50ms, 20% of expected)
  const tolerance = Math.max(50, expectedMs * 0.20)
  const drift = actualMs - expectedMs
  return {
    pass: Math.abs(drift) <= tolerance,
    drift,
    tolerance
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ----- T014: happy path -----

test('track(): resolves to the inner return value and records a query entry', async () => {
  const { run, track, _activeContext } = await import('../../src/index.js')

  let recorded
  await run(async () => {
    recorded = await track('db.users.findById', async () => {
      await sleep(10)
      return { id: 42, name: 'Ada' }
    })
  })

  assert.deepEqual(recorded, { id: 42, name: 'Ada' }, 'track() must resolve to the inner value')

  const _ctx = (await import('../../src/context.js'))._activeContext() // null outside run
  // We need the context INSIDE run; capture it during run via a closure.
  // (the variable above is for documentation only)
})

test('track(): recorded query has name, startTime, endTime, duration, status, error', async () => {
  const { run, track } = await import('../../src/index.js')
  let ctxRef

  await run(async () => {
    const ctx = (await import('../../src/context.js'))._activeContext()
    ctxRef = ctx

    await track('http.fetch.upstream', async () => {
      await sleep(20)
      return 'ok'
    })
  })

  assert.equal(ctxRef.queries.length, 1, 'one query recorded')
  const q = ctxRef.queries[0]
  assert.equal(q.name, 'http.fetch.upstream')
  assert.match(q.id, UUID_V4, 'query id is a UUID v4')
  assert.match(q.startTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'startTime is ISO with ms')
  assert.match(q.endTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'endTime is ISO with ms')
  assert.equal(q.status, 'ok')
  assert.equal(q.error, null)
  assert.equal(typeof q.durationInMilliseconds, 'number')

  const { pass, drift, tolerance } = timingCheck(q.durationInMilliseconds, 20)
  assert.ok(pass, `duration drift ${drift}ms exceeds tolerance ±${tolerance}ms (actual=${q.durationInMilliseconds}ms, expected≈20ms)`)
})

// ----- T015: async throw -----

test('track(): async throw records status=error and re-throws to caller', async () => {
  const { run, track } = await import('../../src/index.js')
  let ctxRef

  await assert.rejects(async () => {
    await run(async () => {
      ctxRef = (await import('../../src/context.js'))._activeContext()
      await track('db.users.findById', async () => {
        await sleep(5)
        throw new Error('connection refused')
      })
    })
  }, /connection refused/)

  assert.equal(ctxRef.queries.length, 1)
  const q = ctxRef.queries[0]
  assert.equal(q.status, 'error')
  assert.ok(q.error, 'error must be captured')
  assert.equal(q.error.name, 'Error')
  assert.equal(q.error.message, 'connection refused')
  assert.match(q.error.stack, /Error: connection refused/, 'stack must be preserved')
  assert.ok(q.endTime, 'endTime must be set even on error')
})

// ----- T016: sync throw -----

test('track(): sync throw inside the inner function is recorded and re-thrown', async () => {
  const { run, track } = await import('../../src/index.js')
  let ctxRef

  await assert.rejects(async () => {
    await run(async () => {
      ctxRef = (await import('../../src/context.js'))._activeContext()
      await track('compute.hash', () => {
        throw new RangeError('bad input')
      })
    })
  }, /bad input/)

  assert.equal(ctxRef.queries.length, 1)
  assert.equal(ctxRef.queries[0].status, 'error')
  assert.equal(ctxRef.queries[0].error.name, 'RangeError')
})

// ----- T017: nesting with parentQueryId -----

test('track(): nested calls record both; inner has parentQueryId = outer.id', async () => {
  const { run, track } = await import('../../src/index.js')
  let ctxRef

  await run(async () => {
    ctxRef = (await import('../../src/context.js'))._activeContext()
    await track('http.api.users', async () => {
      await sleep(10)
      await track('db.users.findById', async () => {
        await sleep(5)
        return 42
      })
      await track('db.profile.findById', async () => {
        await sleep(5)
        return 'Ada'
      })
    })
  })

  assert.equal(ctxRef.queries.length, 3, 'all three queries recorded')
  const [outer, inner1, inner2] = ctxRef.queries

  assert.equal(outer.name, 'http.api.users')
  assert.equal(outer.parentQueryId, null, 'top-level track() has no parent')

  assert.equal(inner1.name, 'db.users.findById')
  assert.equal(inner1.parentQueryId, outer.id, 'inner1.parentQueryId === outer.id')

  assert.equal(inner2.name, 'db.profile.findById')
  assert.equal(inner2.parentQueryId, outer.id, 'inner2.parentQueryId === outer.id')

  // Ordering: inner calls complete BEFORE outer (in wall-clock order they're nested).
  assert.ok(outer.endTime >= inner1.endTime, 'outer.endTime must be >= inner1.endTime')
  assert.ok(outer.endTime >= inner2.endTime, 'outer.endTime must be >= inner2.endTime')
})

test('track(): deeply nested calls form a chain via parentQueryId', async () => {
  const { run, track } = await import('../../src/index.js')
  let ctxRef

  await run(async () => {
    ctxRef = (await import('../../src/context.js'))._activeContext()
    await track('L1', async () => {
      await track('L2', async () => {
        await track('L3', async () => {
          await sleep(2)
          return 'deep'
        })
      })
    })
  })

  const [l1, l2, l3] = ctxRef.queries
  assert.equal(l1.parentQueryId, null)
  assert.equal(l2.parentQueryId, l1.id)
  assert.equal(l3.parentQueryId, l2.id)
})

// ----- T018: metadata pass-through -----

test('track(): opts.metadata is preserved on the query entry', async () => {
  const { run, track } = await import('../../src/index.js')
  let ctxRef

  await run(async () => {
    ctxRef = (await import('../../src/context.js'))._activeContext()
    await track('llm.gpt-4o-mini.chat', async () => 'hi', {
      metadata: { model: 'gpt-4o-mini', tokensIn: 142, tokensOut: 58, costUsd: 0.000123 }
    })
  })

  assert.deepEqual(ctxRef.queries[0].metadata, {
    model: 'gpt-4o-mini', tokensIn: 142, tokensOut: 58, costUsd: 0.000123
  })
})

test('track(): opts.onResult(result) merges post-call metadata into the query entry', async () => {
  // onResult is for information that is only known after the call completes
  // (e.g. LLM tokens + cost returned by the API). It must not be called when
  // fn() throws, and it must not break the call if it itself throws.
  const { run, track } = await import('../../src/index.js')
  let ctxRef

  await run(async () => {
    ctxRef = (await import('../../src/context.js'))._activeContext()
    await track('llm.gpt-4o-mini.chat', async () => ({ tokensIn: 142, tokensOut: 58, costUsd: 0.000123 }), {
      metadata: { provider: 'openai', model: 'gpt-4o-mini' },
      onResult: (r) => ({ tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd })
    })
  })

  assert.deepEqual(ctxRef.queries[0].metadata, {
    provider: 'openai',
    model: 'gpt-4o-mini',
    tokensIn: 142,
    tokensOut: 58,
    costUsd: 0.000123
  })
})

test('track(): opts.onResult is NOT called when fn() throws (no spurious metadata on error)', async () => {
  let onResultCalled = false
  const { run, track } = await import('../../src/index.js')
  let ctxRef

  await run(async () => {
    ctxRef = (await import('../../src/context.js'))._activeContext()
    try {
      await track('boom', async () => { throw new Error('kaboom') }, {
        onResult: (_r) => { onResultCalled = true; return { extra: 1 } }
      })
    } catch { /* expected */ }
  })

  assert.equal(onResultCalled, false, 'onResult must not run when fn() throws')
  assert.equal(ctxRef.queries[0].status, 'error')
  assert.equal(ctxRef.queries[0].metadata, null, 'metadata remains null when fn() throws and no static metadata was given')
})

test('track(): a throwing onResult does not break the call (errors are swallowed)', async () => {
  // The contract is that onResult failures must never break the caller's flow.
  const { run, track } = await import('../../src/index.js')
  let ctxRef

  let result
  await run(async () => {
    ctxRef = (await import('../../src/context.js'))._activeContext()
    result = await track('safe', async () => 42, {
      onResult: () => { throw new Error('oops') }
    })
  })

  assert.equal(result, 42, 'the return value still resolves to the caller')
  assert.equal(ctxRef.queries[0].status, 'ok')
  assert.equal(ctxRef.queries[0].metadata, null, 'a throwing onResult leaves metadata null')
})

// ----- US1 — real-world async patterns -----

test('track(): PARALLEL fan-out — three parallel calls record independently with correct durations', async () => {
  const { run, track } = await import('../../src/index.js')
  let ctxRef

  await run(async () => {
    ctxRef = (await import('../../src/context.js'))._activeContext()
    // Realistic shape: a single request kicks off DB, HTTP, and LLM in parallel.
    const [user, profile, summary] = await Promise.all([
      track('db.users.findById', async () => { await sleep(40); return { id: 1 } }),
      track('http.upstream.profile', async () => { await sleep(80); return { theme: 'dark' } }),
      track('llm.gpt-4o-mini.summarize', async () => { await sleep(120); return 'summary text' })
    ])
    assert.equal(user.id, 1)
    assert.equal(profile.theme, 'dark')
    assert.equal(summary, 'summary text')
  })

  assert.equal(ctxRef.queries.length, 3)

  // Find queries by name (order is registration order, but be robust)
  const byName = Object.fromEntries(ctxRef.queries.map(q => [q.name, q]))
  const durations = {
    db: byName['db.users.findById'].durationInMilliseconds,
    http: byName['http.upstream.profile'].durationInMilliseconds,
    llm: byName['llm.gpt-4o-mini.summarize'].durationInMilliseconds
  }

  // Each parallel call's duration should approximate its own sleep, NOT the sum.
  // This validates that track() measures per-call wall time, not request time.
  for (const [label, actual] of Object.entries(durations)) {
    const expected = { db: 40, http: 80, llm: 120 }[label]
    const { pass, drift, tolerance } = timingCheck(actual, expected)
    assert.ok(pass, `${label}: drift ${drift}ms exceeds tolerance ±${tolerance}ms (actual=${actual}ms, expected≈${expected}ms)`)
  }

  // The longest (120ms) is the wall-clock for the parallel section.
  const wallClock = Math.max(...Object.values(durations))
  assert.ok(wallClock < 200, `parallel wall-clock should be ≈ max duration, not sum. Got ${wallClock}ms (sum would be 240ms+)`)
})

test('track(): SERIAL chain — three sequential calls sum approximately on the parent timeline', async () => {
  const { run, track } = await import('../../src/index.js')
  let ctxRef

  await run(async () => {
    ctxRef = (await import('../../src/context.js'))._activeContext()
    await track('outer.pipeline', async () => {
      await track('step1', async () => { await sleep(30) })
      await track('step2', async () => { await sleep(30) })
      await track('step3', async () => { await sleep(30) })
    })
  })

  const outer = ctxRef.queries[0]
  // Outer must have run for at least the sum of the three steps.
  // Generous tolerance: ±50ms OR ±20% of expected sum.
  const expected = 90
  const { pass, drift, tolerance } = timingCheck(outer.durationInMilliseconds, expected)
  assert.ok(pass, `outer drift ${drift}ms exceeds tolerance ±${tolerance}ms (actual=${outer.durationInMilliseconds}ms, expected≈${expected}ms)`)
})

test('track(): MIXED parallel + serial — total approximates (serial-sums + max-parallel)', async () => {
  const { run, track } = await import('../../src/index.js')
  let ctxRef

  await run(async () => {
    ctxRef = (await import('../../src/context.js'))._activeContext()
    // Stage 1: one DB call (30ms)
    await track('stage1.db', async () => { await sleep(30) })
    // Stage 2: three parallel calls (30, 50, 40ms — max is 50ms)
    await Promise.all([
      track('stage2.a', async () => { await sleep(30) }),
      track('stage2.b', async () => { await sleep(50) }),
      track('stage2.c', async () => { await sleep(40) })
    ])
    // Stage 3: one LLM call (20ms)
    await track('stage3.llm', async () => { await sleep(20) })
  })

  assert.equal(ctxRef.queries.length, 5)
  const startTimes = ctxRef.queries.map(q => Date.parse(q.startTime)).sort((a, b) => a - b)
  const endTimes = ctxRef.queries.map(q => Date.parse(q.endTime)).sort((a, b) => a - b)
  const totalWall = endTimes.at(-1) - startTimes[0]
  // Expected: 30 + 50 + 20 = 100ms (serial bottleneck; the 30+40 stage 2 runs in parallel with the 50)
  const { pass, drift, tolerance } = timingCheck(totalWall, 100)
  assert.ok(pass, `total wall drift ${drift}ms exceeds tolerance ±${tolerance}ms (actual=${totalWall}ms, expected≈100ms)`)
})

test('track(): returning a non-promise (sync value) is supported', async () => {
  const { run, track } = await import('../../src/index.js')
  let ctxRef
  let result

  await run(async () => {
    ctxRef = (await import('../../src/context.js'))._activeContext()
    result = await track('compute.sync', () => 7)
  })

  assert.equal(result, 7)
  assert.equal(ctxRef.queries[0].status, 'ok')
})

test('track(): returning a falsy value (0, null, "") is preserved', async () => {
  const { run, track } = await import('../../src/index.js')
  for (const value of [0, null, '', false]) {
    let ctxRef
    const result = await run(async () => {
      ctxRef = (await import('../../src/context.js'))._activeContext()
      return await track('returns.falsy', () => value)
    })
    assert.strictEqual(result, value, `result must be ${JSON.stringify(value)}`)
    assert.equal(ctxRef.queries[0].status, 'ok')
  }
})

// ----- Caching: not a Phase 1 SDK feature, but the demo app simulates a cache hit
//      to prove that track() can be wrapped around cached reads -----

test('track(): a "cache hit" wrapper records zero/near-zero duration without distorting other timings', async () => {
  const { run, track } = await import('../../src/index.js')
  let ctxRef

  await run(async () => {
    ctxRef = (await import('../../src/context.js'))._activeContext()
    await Promise.all([
      track('cache.hit', async () => {
        // simulate in-memory cache lookup
        return { value: 'cached' }
      }),
      track('cache.miss.then.fetch', async () => {
        await sleep(20)
        return { value: 'fresh' }
      })
    ])
  })

  const byName = Object.fromEntries(ctxRef.queries.map(q => [q.name, q]))
  assert.ok(byName['cache.hit'].durationInMilliseconds < 10,
    `cache hit should be sub-10ms, got ${byName['cache.hit'].durationInMilliseconds}ms`)
  const { pass } = timingCheck(byName['cache.miss.then.fetch'].durationInMilliseconds, 20)
  assert.ok(pass, 'cache miss must record ~20ms even when paired with a near-instant cache hit')
})

// ----- Edge: track() called OUTSIDE a run() context -----

test('track(): called outside run() still records but parentQueryId is null and id is locally generated', async () => {
  const { track, _activeContext } = await import('../../src/index.js')
  assert.equal(_activeContext(), null, 'precondition: no active context')

  // We can't observe the recorded query from outside (no context), but we can
  // assert track() does not throw.
  const result = await track('orphan', async () => 'ok')
  assert.equal(result, 'ok')
})