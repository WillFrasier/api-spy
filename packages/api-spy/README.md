# api-spy SDK

A lightweight Node.js SDK for instrumenting slow backend operations — HTTP
calls, database queries, LLM calls — and surfacing the resulting request
tree in a browser debugger.

- **Zero runtime dependencies.** Built on Node's built-in
  `AsyncLocalStorage`. No HTTP client, no DB driver, no LLM SDK bundled.
- **< 1KB minified.** The whole SDK is a few hundred lines.
- **Production-safe.** The middleware never swallows errors and never
  blocks the request loop.
- **Multi-framework-ready.** Phase 1 ships Express; Fastify/Koa adapters
  are planned for follow-on specs.

## Install

```bash
npm install api-spy
```

Node ≥ 18 required.

## Quick start

```js
import express from 'express'
import * as apiSpy from 'api-spy'

const app = express()
app.use(apiSpy.expressMiddleware())           // tag every response

app.get('/users/:id', async (req, res, next) => {
  try {
    const user = await apiSpy.track('db.users.findById', () =>
      db.findUser(req.params.id)
    )
    const profile = await apiSpy.track('http.upstream.profile', () =>
      fetch(`https://profile.example.com/${user.id}`).then(r => r.json())
    )
    const summary = await apiSpy.track(
      'llm.gpt-4o-mini.summarize',
      () => llm.summarize(profile),
      { metadata: { model: 'gpt-4o-mini', tokensIn: 142, tokensOut: 58, costUsd: 0.000123 } }
    )
    res.json({ user, summary })
  } catch (err) {
    next(err)
  }
})

// Debugger endpoint: fetch the recorded tree by request id.
app.get('/api/v1/apiDebugger/:id', (req, res) => {
  const record = apiSpy._store().get(req.params.id)
  if (!record) return res.status(404).json({ error: 'not_found' })
  res.json(record)
})

app.listen(3000)
```

## Public API

| Export | Purpose |
| --- | --- |
| `run(fn, { id? })` | Run `fn` inside a fresh request context. Context (including the UUID) is preserved across `await`, `setTimeout`, `Promise.all`. |
| `getRequestId()` | Returns the UUID for the current request, or `null` outside a `run()` context. |
| `track(name, fn, { metadata? })` | Records a `Query` entry for `fn`, resolves to its return value, captures errors. |
| `expressMiddleware()` | Express middleware: opens a request context, sets `X-ApiSpy-RequestId`, saves the assembled record on response finish. |
| `createInMemoryStore({ capacity? })` | Returns an LRU-capped `Map`-backed store. Default capacity 1000. |
| `_store()` | Returns the currently-active store (used by the debugger route and tests). |
| `init()` | Logs a one-time `[api-spy] initialized` line. Optional. |

## Captured record shape

```jsonc
{
  "id": "5b1f3c8e-2c4a-4f0e-9a4d-1a2b3c4d5e6f",
  "startTime": "2026-06-19T00:00:00.000Z",
  "endTime":   "2026-06-19T00:00:00.207Z",
  "durationInMilliseconds": 207,
  "status": "ok",          // "ok" | "error"
  "error": null,
  "queries": [
    {
      "id": "1a2b3c4d-...",
      "name": "db.users.findById",
      "parentQueryId": null,
      "startTime": "...",
      "endTime": "...",
      "durationInMilliseconds": 30,
      "status": "ok",
      "error": null,
      "metadata": { "table": "users", "id": "42" }
    }
    // ... nested queries form a tree via parentQueryId
  ]
}
```

## Timing accuracy

`track()` measures wall-clock time around your inner function, including all
async work inside it. It does NOT include the time *between* `track()` calls.

We validate timing in the test suite with a generous tolerance — `±50ms` OR
`±20%` of the expected duration, whichever is larger — because Node's event
loop and V8 are noisy at sub-millisecond resolution. The goal is "in the
right ballpark", not micro-bench precision.

## Why a separate file for context?

The SDK uses `AsyncLocalStorage` for context propagation. This is the
modern, built-in replacement for `continuation-local-storage` /
`request-local-storage`. It works across all async boundaries (Promises,
`setTimeout`, event emitters) without monkey-patching.

## Test it

```bash
npm test                  # unit + contract
npm run test:integration  # express + middleware
npm run test:all          # everything
```

55 tests across 3 suites, all green.

## License

ISC
