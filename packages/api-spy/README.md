# api-spy SDK

A lightweight Node SDK for instrumenting slow backend operations — HTTP
calls, database queries, LLM calls — and surfacing the resulting request
tree to a debugger endpoint or browser panel.

- **Zero runtime dependencies.** Built on Node's built-in `AsyncLocalStorage`.
- **ESM only.** Node ≥ 18.
- **Express middleware included.** The `track()` / `run()` API is
  framework-agnostic; the Express adapter is the only built-in middleware.
- **Production-safe.** The middleware never swallows errors and never
  blocks the request loop. A failed store save does not crash the request.

## Install

```bash
npm install api-spy
```

## Quick start

```js
import express from 'express'
import * as apiSpy from 'api-spy'

const app = express()
app.use(apiSpy.expressMiddleware())             // opens a request context per request

app.get('/users/:id', async (req, res, next) => {
  try {
    const user = await apiSpy.track('db.users.findById',
      () => db.findUser(req.params.id),
      { metadata: { table: 'users', id: req.params.id } }
    )
    const profile = await apiSpy.track('http.upstream.profile',
      () => fetch(`https://profile.example.com/${user.id}`).then(r => r.json())
    )
    const summary = await apiSpy.track(
      'llm.gpt-4o-mini.summarize',
      () => llm.summarize(profile),
      { metadata: { model: 'gpt-4o-mini', tokensIn: 142, tokensOut: 58, costUsd: 0.000123 } }
    )
    res.json({ user, summary })
  } catch (err) {
    next(err)                                     // never swallow handler errors
  }
})

// Debugger endpoint: returns the recorded request tree, or 404.
app.get('/api/v1/apiDebugger/:id', (req, res) => {
  const record = apiSpy._store().get(req.params.id)
  if (!record) return res.status(404).json({ error: 'not_found', requestId: req.params.id })
  res.json({
    requestId: record.id,
    timing: { startTime: record.startTime, endTime: record.endTime, durationInMilliseconds: record.durationInMilliseconds },
    queries: record.queries,
    error: record.error
  })
})

app.listen(3000)
```

Every response now carries `X-ApiSpy-RequestId: <uuid>`. Save the id at
the moment of the request and you can pull the call graph anytime the
store still has it.

## Public API

These are the symbols exported from `api-spy`. Everything else is internal
and may change between minor versions.

| Export | Purpose |
| --- | --- |
| `run(fn, { id? })` | Run `fn` inside a fresh request context. The context (including the generated UUID) is preserved across `await`, `setTimeout`, `Promise.all`, microtasks, and event emitters. Pass `{ id }` to use a pre-generated UUID — the Express middleware does this so the response header and the ALS context share the same id. |
| `getRequestId()` | Returns the current request's UUID, or `null` if called outside a `run()` context. |
| `track(name, fn, { metadata? })` | Wrap `fn` in a recorded `Query`. Resolves to `fn`'s return value. Records `name`, ISO start/end times, wall-clock `durationInMilliseconds`, `status` (`'ok' \| 'error'`), `error` (name/message/stack when status is `'error'`), and optional `metadata`. If `fn` throws, the error is captured on the query and re-thrown to the caller. |
| `expressMiddleware()` | Express middleware: opens a request context, sets `X-ApiSpy-RequestId` on the response, waits for `'finish'` or `'close'`, then saves the assembled record. Handler errors propagate to `next(err)` unchanged. |
| `createInMemoryStore({ capacity? })` | Build a new LRU-capped in-memory store. Default capacity `1000`. Each call returns a fresh store. |
| `init({ store? })` | Swap the global store. Call once at boot if you want a different capacity or a custom store. Idempotent. |

### Custom stores

Any object with `save(record)` and `get(id)` methods works. The contract
of `save` is: store under `record.id`; on capacity pressure, evict any
record. The contract of `get` is: return the record or `undefined`.

```js
import * as apiSpy from 'api-spy'

class TinyStore {
  constructor () { this._m = new Map() }
  save (record) { this._m.set(record.id, record) }
  get (id) { return this._m.get(id) }
}

apiSpy.init({ store: new TinyStore() })
```

If you build a Redis, SQLite, or OpenTelemetry-exporter store, please
open a PR — the store interface is intentionally minimal.

## Internals (not for external use)

These are exported because the demo app, the Express middleware, and the
test suite need them, but they are not part of the stable contract:

- `_activeContext()` — returns the current `RequestContext` (for tests and the middleware).
- `_store()` — returns the active store. Underscore = "internal."

The captured record's internal shape (lives on the in-memory store) is:

```ts
type RequestRecord = {
  id: string                              // UUID v4
  startTime: string                       // ISO 8601 with milliseconds
  endTime: string | null
  durationInMilliseconds: number
  status: 'ok' | 'error'
  error: { name: string, message: string, stack: string } | null
  queries: Query[]
}

type Query = {
  id: string                              // UUID v4
  name: string                            // e.g. "db.users.findById"
  parentQueryId: string | null            // forms a tree
  startTime: string
  endTime: string | null
  durationInMilliseconds: number
  status: 'ok' | 'error'
  error: { name: string, message: string, stack: string } | null
  metadata: Record<string, unknown> | null
}
```

## What `/apiDebugger/:id` returns

The debugger endpoint (or any consumer) wraps a `RequestRecord` into the
**wire shape**, which has a flatter top level and is JSON-safe:

```jsonc
{
  "requestId": "5b1f3c8e-2c4a-4f0e-9a4d-1a2b3c4d5e6f",
  "timing": {
    "startTime": "2026-06-19T19:30:00.100Z",
    "endTime":   "2026-06-19T19:30:00.158Z",
    "durationInMilliseconds": 58
  },
  "error": null,
  "queries": [
    { "id": "11111111-1111-4111-8111-111111111111",
      "name": "db.users.findById", "parentQueryId": null,
      "startTime": "2026-06-19T19:30:00.105Z", "endTime": "2026-06-19T19:30:00.118Z",
      "durationInMilliseconds": 13, "status": "ok", "error": null, "metadata": null },
    { "id": "22222222-2222-4222-8222-222222222222",
      "name": "http.fetch.upstream", "parentQueryId": null,
      "startTime": "2026-06-19T19:30:00.119Z", "endTime": "2026-06-19T19:30:00.142Z",
      "durationInMilliseconds": 23, "status": "ok", "error": null,
      "metadata": { "url": "https://api.example.com/profile" } },
    { "id": "33333333-3333-4333-8333-333333333333",
      "name": "llm.gpt-4o-mini.chat", "parentQueryId": null,
      "startTime": "2026-06-19T19:30:00.143Z", "endTime": "2026-06-19T19:30:00.155Z",
      "durationInMilliseconds": 12, "status": "ok", "error": null,
      "metadata": { "model": "gpt-4o-mini", "tokensIn": 142, "tokensOut": 58 } }
  ]
}
```

A full worked example is in
`specs/001-phase1-sdk-foundation/contracts/api-debugger-response.example.json`.

## Design notes

**`AsyncLocalStorage`, not continuation-local storage.** Node's built-in
`node:async_hooks.AsyncLocalStorage` is the modern replacement for
`continuation-local-storage` / `request-local-storage`. It works across
Promises, `setTimeout`, microtasks, and event emitters with zero
monkey-patching and zero runtime dependencies. Node ≥ 14 ships it.

**Wall-clock timing, not micro-bench precision.** `track()` measures
the wall-clock duration of your inner function, including all async
work inside it. It does NOT include the time *between* `track()` calls.
We validate timing in the test suite with `±50ms` or `±20%` of expected
duration, whichever is larger. The goal is "in the right ballpark" —
not micro-bench precision, which Node's event loop and V8 don't support
reliably at sub-millisecond resolution.

**Tree via `parentQueryId`, not nesting.** We could have stored queries
as a tree of objects. We store them as a flat array with a
`parentQueryId` pointer because (a) JSON serializes flat better, (b) a
flat array is friendlier to logs and spreadsheets, and (c) you can
rebuild the tree client-side without ambiguity. This is the same shape
that `chrome://tracing`, Jaeger, and `console.trace()` use.

**Why a Map-backed LRU store by default?** Fast, dependency-free, and
sufficient for dev environments. Production at scale will want Redis or
OpenTelemetry — that's a follow-on spec.

## Testing

```bash
npm test                  # unit + contract
npm run test:integration  # express + middleware
npm run test:all          # everything
```

49 tests across 3 suites, all green.

The example app under `examples/demo-app` adds another 9 integration
tests that exercise the public API end-to-end.

## License

ISC
