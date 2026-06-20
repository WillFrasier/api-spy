# api-spy demo app

A runnable Express application that demonstrates the api-spy SDK
end-to-end. It is the SC-005 "clone, install, and `curl` in five minutes"
proof for Phase 1.

## What it does

A single endpoint, `GET /api/v1/users/:id`, makes three instrumented
backend calls:

1. **DB read** — `db.users.findById` (fake, 30 ms)
2. **HTTP fetch** — `http.upstream.profile` (fake, 60 ms)
3. **LLM summary** — `llm.gpt-4o-mini.summarize` (fake, 120 ms, with
   `tokensIn` / `tokensOut` / `costUsd` / `model` metadata)

Each request gets a fresh `X-ApiSpy-RequestId` UUID. The full request
tree is saved in memory and can be inspected via
`GET /api/v1/apiDebugger/:id`.

## Run it

```bash
npm install
npm run demo
```

In another terminal:

```bash
$ curl -i http://localhost:3000/api/v1/users/42
HTTP/1.1 200 OK
X-ApiSpy-RequestId: 5b1f3c8e-2c4a-4f0e-9a4d-1a2b3c4d5e6f
Content-Type: application/json; charset=utf-8

{"id":"42","name":"User 42","theme":"dark","summary":"Summary of User 42: short and snappy."}

$ curl http://localhost:3000/api/v1/apiDebugger/5b1f3c8e-2c4a-4f0e-9a4d-1a2b3c4d5e6f | jq .
{
  "requestId": "5b1f3c8e-2c4a-4f0e-9a4d-1a2b3c4d5e6f",
  "timing": {
    "startTime": "2026-06-19T19:30:00.000Z",
    "endTime":   "2026-06-19T19:30:00.210Z",
    "durationInMilliseconds": 210
  },
  "queries": [
    { "id": "…", "name": "db.users.findById",         "durationInMilliseconds": 30,  "status": "ok" },
    { "id": "…", "name": "http.upstream.profile",     "durationInMilliseconds": 60,  "status": "ok" },
    { "id": "…", "name": "llm.gpt-4o-mini.summarize", "durationInMilliseconds": 120, "status": "ok",
      "metadata": { "model": "gpt-4o-mini", "tokensIn": 142, "tokensOut": 24, "costUsd": 0.000123, "provider": "openai" } }
  ],
  "error": null
}
```

(`X-ApiSpy-RequestId` and `query.id` will be different UUIDs on your
machine. Total wall-clock should be ~210 ms — the three fakes run
sequentially.)

## Run the tests

```bash
npm test
```

## What the tests prove

- **6 integration tests** cover: end-to-end loop, schema validation
  against `specs/001-phase1-sdk-foundation/contracts/`, error responses
  (404 unknown id, 400 malformed id), and the SC-004 100-concurrent
  stress test (100 distinct ids, zero cross-contamination between
  requests).
- The LLM test asserts that `tokensIn` / `tokensOut` / `costUsd` /
  `model` are carried through to the recorded tree, so LLM cost
  tracking is a first-class shape — not a footnote.

## File map

```text
src/
  server.js               — Express bootstrap (mounts middleware + routes)
  routes/
    users.js              — /api/v1/users/:id handler with three apiSpy.track() calls
    debugger.js           — /api/v1/apiDebugger/:id handler (404 / 400 / 200)
  fakes/
    db.js                 — fake DB lookup (30 ms)
    http.js               — fake HTTP fetch (60 ms)
    llm.js                — fake LLM summary (120 ms) with token + cost metadata
tests/
  users.test.js           — 6 integration tests
```

## Why this exists

Per `specs/001-phase1-sdk-foundation/`, Phase 1 ships the SDK + this
demo. The SC-005 success criterion is "a developer can `git clone`,
`npm install`, and `npm run demo` in under 5 minutes" — this directory
is that proof.
