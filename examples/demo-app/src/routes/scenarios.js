// scenarios.js — additional demo routes that exercise different
// async patterns so the Gantt chart has something interesting to show.
//
// Each route returns a small JSON payload; the instrumentation is the
// point.  Run them in any order from the demo page buttons.

import { Router } from 'express'
import * as apiSpy from 'api-spy'
import { findUser } from '../fakes/db.js'
import { fetchProfile } from '../fakes/http.js'
import { summarize, chatCompletion } from '../fakes/llm.js'
import { getCached } from '../fakes/cache.js'
import { search, heavySummarize } from '../fakes/search.js'

const router = Router()

// 1) Parallel fan-out — three track()s in the same tick, all racing.
//    Best case for the Gantt: all three bars overlap.
router.get('/parallel', async (req, res, next) => {
  try {
    const [user, profile, cached] = await Promise.all([
      apiSpy.track('db.users.findById', () => findUser(42), { metadata: { table: 'users' } }),
      apiSpy.track('http.profile.fetch', () => fetchProfile(42), { metadata: { host: 'profile.example.com' } }),
      apiSpy.track('cache.user.hit', () => getCached('user:42'), { metadata: { key: 'user:42' } })
    ])
    res.json({ scenario: 'parallel', user, profile, cached })
  } catch (err) { next(err) }
})

// 2) Mixed serial + parallel — a chain with a fan-out in the middle.
//    Demonstrates that the Gantt preserves parent/child relationships.
router.get('/mixed', async (req, res, next) => {
  try {
    const user = await apiSpy.track('db.users.findById', () => findUser(42))
    const [profile, searchResults] = await Promise.all([
      apiSpy.track('http.profile.fetch', () => fetchProfile(user.id)),
      apiSpy.track('search.index.query', () => search(user.name, 90), { metadata: { latencyMs: 90 } })
    ])
    const summary = await apiSpy.track('llm.gpt-4o-mini.summarize', () => summarize({ ...user, theme: profile.theme }))
    res.json({ scenario: 'mixed', user, profile, searchResults, summary })
  } catch (err) { next(err) }
})

// 3) Error path — a track() that throws.  The bar should render red.
router.get('/error', async (req, res, next) => {
  try {
    await apiSpy.track('db.users.findById', () => findUser(42))
    await apiSpy.track('http.flaky.upstream', async () => {
      await new Promise(r => setTimeout(r, 50))
      const e = new Error('upstream 503 — service unavailable')
      e.status = 503
      throw e
    })
  } catch (err) { next(err) }
})

// 4) Nested — a track() inside a track().  The inner bar is a child
//    of the outer bar; the Gantt still flattens to a list with
//    parentQueryId links (see contracts/api-debugger-response.schema.json).
router.get('/nested', async (req, res, next) => {
  try {
    const result = await apiSpy.track('orchestrator.handle', async () => {
      const user = await apiSpy.track('db.users.findById', () => findUser(42), { metadata: { nested: true } })
      const profile = await apiSpy.track('http.profile.fetch', () => fetchProfile(user.id), { metadata: { nested: true } })
      const summary = await apiSpy.track('llm.gpt-4o-mini.summarize', () => summarize({ ...user, theme: profile.theme }), { metadata: { nested: true } })
      return { user, profile, summary }
    })
    res.json({ scenario: 'nested', ...result })
  } catch (err) { next(err) }
})

// 5) Slow — a 1.2s+ request. Useful to see the Gantt chart scale to long
//    durations and the panel stay focused on a single request while it
//    runs (the request stays 'pending' until it completes).
router.get('/slow', async (req, res, next) => {
  try {
    const user = await apiSpy.track('db.users.findById', () => findUser(42))
    const profile = await apiSpy.track('http.profile.fetch', () => fetchProfile(user.id))
    const summary = await apiSpy.track('llm.gpt-4o-mini.heavy', () => heavySummarize(profile.text), { metadata: { latencyMs: 1200 } })
    res.json({ scenario: 'slow', user, profile, summary })
  } catch (err) { next(err) }
})

// 6) Explicit HTTP error codes — each route returns a specific status code
//    so the user can see how 401/404/500 surface in the request list
//    badge (status=error, red bar).
router.get('/unauthorized', (req, res, next) => {
  // Simulate a guard that fails before any backend work happens.
  const err = new Error('missing or invalid auth token')
  err.status = 401
  next(err)
})

router.get('/notfound', async (req, res, next) => {
  try {
    await apiSpy.track('db.users.findById', async () => {
      const e = new Error('user not found')
      e.status = 404
      throw e
    })
  } catch (err) { next(err) }
})

router.get('/server-error', async (req, res, next) => {
  try {
    await apiSpy.track('db.users.findById', () => findUser(42))
    await apiSpy.track('llm.gpt-4o-mini.summarize', async () => {
      const e = new Error('openai 500 — internal server error')
      e.status = 500
      throw e
    })
  } catch (err) { next(err) }
})

// 7) Burst — fire 5 small requests in parallel. Useful to fill the
//    request list and see how the panel scrolls with many entries.
router.get('/burst', async (req, res, next) => {
  try {
    const N = 5
    await Promise.all(Array.from({ length: N }, (_, i) =>
      apiSpy.track(`db.users.findById.${i}`, () => findUser(i), { metadata: { batch: 'burst' } })
    ))
    res.json({ scenario: 'burst', count: N })
  } catch (err) { next(err) }
})

// 8) LLM fan-out — three different models in parallel. Each call
//    records tokensIn / tokensOut / costUsd / latencyMs in metadata
//    so the overlay can show cost and the debugger JSON has the
//    full picture of a multi-model request.
router.get('/llm-fanout', async (req, res, next) => {
  try {
    const prompt = 'Summarize the following customer feedback in two sentences: ' +
      '"The product is great but the onboarding is confusing. ' +
      'I had to read three different docs to figure out how to invite my team."'
    const [mini, full, haiku] = await Promise.all([
      apiSpy.track(
        'llm.gpt-4o-mini.chat',
        () => chatCompletion({ prompt, model: 'gpt-4o-mini' }),
        {
          metadata: { provider: 'openai', model: 'gpt-4o-mini' },
          onResult: (r) => ({ tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd })
        }
      ),
      apiSpy.track(
        'llm.gpt-4o.chat',
        () => chatCompletion({ prompt, model: 'gpt-4o' }),
        {
          metadata: { provider: 'openai', model: 'gpt-4o' },
          onResult: (r) => ({ tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd })
        }
      ),
      apiSpy.track(
        'llm.claude-haiku.chat',
        () => chatCompletion({ prompt, model: 'claude-haiku' }),
        {
          metadata: { provider: 'anthropic', model: 'claude-haiku' },
          onResult: (r) => ({ tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd })
        }
      )
    ])
    const totalCost = mini.costUsd + full.costUsd + haiku.costUsd
    res.json({
      scenario: 'llm-fanout',
      totalCostUsd: Number(totalCost.toFixed(6)),
      calls: {
        'gpt-4o-mini': { tokensIn: mini.tokensIn, tokensOut: mini.tokensOut, costUsd: mini.costUsd },
        'gpt-4o': { tokensIn: full.tokensIn, tokensOut: full.tokensOut, costUsd: full.costUsd },
        'claude-haiku': { tokensIn: haiku.tokensIn, tokensOut: haiku.tokensOut, costUsd: haiku.costUsd }
      }
    })
  } catch (err) { next(err) }
})

// 9) LLM chain — three models called in series (each prompt depends
//    on the previous output). Useful to see serial Gantt bars for LLM
//    calls and how a multi-step agent pattern shows up in the timeline.
router.get('/llm-chain', async (req, res, next) => {
  try {
    const draft = await apiSpy.track(
      'llm.gpt-4o-mini.draft',
      () => chatCompletion({ prompt: 'Write a haiku about GraphQL APIs', model: 'gpt-4o-mini' }),
      {
        metadata: { provider: 'openai', model: 'gpt-4o-mini', step: 'draft' },
        onResult: (r) => ({ tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd })
      }
    )
    const critique = await apiSpy.track(
      'llm.gpt-4o.critique',
      () => chatCompletion({ prompt: draft.text, model: 'gpt-4o' }),
      {
        metadata: { provider: 'openai', model: 'gpt-4o', step: 'critique' },
        onResult: (r) => ({ tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd })
      }
    )
    const final = await apiSpy.track(
      'llm.claude-haiku.finalize',
      () => chatCompletion({ prompt: critique.text, model: 'claude-haiku' }),
      {
        metadata: { provider: 'anthropic', model: 'claude-haiku', step: 'finalize' },
        onResult: (r) => ({ tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd })
      }
    )
    res.json({
      scenario: 'llm-chain',
      steps: [draft.text.slice(0, 40), critique.text.slice(0, 40), final.text.slice(0, 40)],
      totalCostUsd: Number((draft.costUsd + critique.costUsd + final.costUsd).toFixed(6))
    })
  } catch (err) { next(err) }
})

export default router
