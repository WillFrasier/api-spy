# api-spy

A Node SDK that captures the **call graph** of slow backend operations —
HTTP, database, LLM — for each incoming request, and exposes it as JSON
over an `/apiDebugger/:id` endpoint that a future browser debugger (or
`curl`) can inspect.

> **Status — Phase 1 (SDK + demo loop).** The Chrome extension is being
> rewritten against this SDK in a follow-on spec. Until then, the debugger
> endpoint is JSON-only. See `specs/001-phase1-sdk-foundation/spec.md` for
> the full plan.

## What you get

```text
$ curl -i http://localhost:3000/api/v1/users/42
HTTP/1.1 200 OK
X-ApiSpy-RequestId: 5b1f3c8e-2c4a-4f0e-9a4d-1a2b3c4d5e6f
Content-Type: application/json

{"id":"42","name":"User 42","theme":"dark","summary":"…"}
```

```text
$ curl http://localhost:3000/api/v1/apiDebugger/5b1f3c8e-2c4a-4f0e-9a4d-1a2b3c4d5e6f | jq .
{
  "requestId": "5b1f3c8e-2c4a-4f0e-9a4d-1a2b3c4d5e6f",
  "timing": {
    "startTime": "2026-06-19T00:00:00.000Z",
    "endTime":   "2026-06-19T00:00:00.207Z",
    "durationInMilliseconds": 207
  },
  "queries": [
    { "name": "db.users.findById",        "durationInMilliseconds": 30,  "status": "ok" },
    { "name": "http.upstream.profile",    "durationInMilliseconds": 60,  "status": "ok" },
    { "name": "llm.gpt-4o-mini.summarize","durationInMilliseconds": 120, "status": "ok",
      "metadata": { "model": "gpt-4o-mini", "tokensIn": 142, "tokensOut": 58, "costUsd": 0.000123 } }
  ],
  "error": null
}
```

You see, for every request, the wall-clock cost of each downstream call —
in tree order, with parent/child links — and the LLM bill in metadata.

## Why

Production debugging usually means staring at three different
observability tools and trying to correlate them by timestamp. api-spy
attaches the call graph **to the request**, so a single id links the
browser view, the server logs, and any external traces.

## Install

```bash
npm install api-spy
```

**Zero runtime dependencies.** Built on Node's built-in `AsyncLocalStorage`.
ESM only. Node ≥ 18.

## Five lines to instrument your app

```js
import express from 'express'
import * as apiSpy from 'api-spy'

const app = express()
app.use(apiSpy.expressMiddleware())              // open a request context
app.use((req, res, next) => {                    // expose the debugger
  res.locals.apiSpy = apiSpy
  next()
})

app.get('/users/:id', async (req, res, next) => {
  try {
    const user = await apiSpy.track('db.users.findById',
      () => db.findUser(req.params.id),
      { metadata: { table: 'users', id: req.params.id } }
    )
    res.json(user)
  } catch (err) {
    next(err)                                    // do not swallow errors
  }
})

app.get('/api/v1/apiDebugger/:id', (req, res) => {
  const record = res.locals.apiSpy._store().get(req.params.id)
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

See [`packages/api-spy/README.md`](./packages/api-spy/README.md) for the
full API surface, or jump straight to the runnable example.

## Quickstart (clone-and-curl in 5 minutes)

```bash
git clone https://github.com/WillFrasier/api-spy.git
cd api-spy
cd examples/demo-app
npm install
npm run demo
# in another terminal:
curl -i http://localhost:3000/api/v1/users/42
# copy the X-ApiSpy-RequestId from the response headers, then:
curl http://localhost:3000/api/v1/apiDebugger/<that-id> | jq .
```

You should see the JSON shape shown at the top of this README.

## Project layout

```text
api-spy/
├── packages/
│   └── api-spy/                  ← the SDK (this is what you npm install)
├── examples/
│   └── demo-app/                 ← runnable demo, clone-and-go
├── specs/                        ← Spec-Driven Development artifacts
│   └── 001-phase1-sdk-foundation/
└── legacy/                       ← pre-Phase 1 code, preserved for reference
```

## What's in and what's deferred

**In this release (Phase 1):**
- `apiSpy.run()` / `getRequestId()` — AsyncLocalStorage context propagation
- `apiSpy.track(name, fn, { metadata })` — record a call, capture timing, errors, parent/child tree
- `apiSpy.expressMiddleware()` — request context + `X-ApiSpy-RequestId` header + auto-save on response finish
- `apiSpy._store()` / `init({ store })` — in-memory LRU store (default 1000 records), swappable
- `examples/demo-app` — three-call instrumented Express app with tests
- 55 tests across 3 suites, ~1.5s end-to-end (see `specs/001-phase1-sdk-foundation/test-transcript.md`)

**Deferred to follow-on specs:**
- **Chrome DevTools panel (MV3)** — the original extension is in `legacy/`; the rewrite is the next deliverable
- **Provider-specific LLM/HTTP/DB wrappers** with automatic token counting and cost calculation
- **Fastify and Koa adapters** — the public API is framework-agnostic, only the middleware is Express-specific
- **Distributed storage** (Redis, OpenTelemetry exporter) — Phase 1 is in-memory only
- **npm publish** — the package.json is publish-ready; the `npm publish` step is a follow-on

## Testing

```bash
# SDK (49 tests: unit + contract + integration)
cd packages/api-spy && npm run test:all

# Demo app (6 tests: end-to-end + SC-004 100-concurrent stress)
cd ../../examples/demo-app && npm test
```

## Contributing

See `specs/001-phase1-sdk-foundation/spec.md` for the design rationale and
`specs/001-phase1-sdk-foundation/tasks.md` for the task breakdown. PRs that
touch the public API should add a test under `tests/contract/`.

## License

ISC — see [LICENSE](./LICENSE).
