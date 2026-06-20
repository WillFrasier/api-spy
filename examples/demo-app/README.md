# api-spy demo app

A reference Express application that demonstrates the **api-spy** SDK end-to-end.

## What it does

A single endpoint, `GET /api/v1/users/:id`, makes three instrumented backend calls:

1. **DB read** (`db.users.findById`) — fake, 30ms
2. **HTTP fetch** (`http.upstream.profile`) — fake, 60ms
3. **LLM summary** (`llm.gpt-4o-mini.summarize`) — fake, 120ms, with token + cost metadata

Each request gets a fresh `X-ApiSpy-RequestId` UUID. The full request tree is
saved in memory and can be inspected via `GET /api/v1/apiDebugger/:id`.

## Run it

```bash
npm install
npm run demo
```

In another terminal:

```bash
# Hit the instrumented endpoint
curl -i http://localhost:3000/api/v1/users/42

# Pull the recorded request tree (use the X-ApiSpy-RequestId from the response)
curl http://localhost:3000/api/v1/apiDebugger/<id>
```

## Run the tests

```bash
npm test
```

## What the tests prove

- 6 integration tests cover: end-to-end loop, schema validation, error responses
  (404 unknown id, 400 malformed id), and the SC-004 100-concurrent stress test
  (100 distinct ids, zero cross-contamination).
- The LLM test asserts that `tokensIn` / `tokensOut` / `costUsd` / `model` are
  carried through to the recorded tree — the real-world shape you asked for.

## File map

```
src/
  server.js               — Express bootstrap
  routes/
    users.js              — /api/v1/users/:id handler with apiSpy.track() calls
    debugger.js           — /api/v1/apiDebugger/:id handler
  fakes/
    db.js                 — fake DB lookup (30ms)
    http.js               — fake HTTP fetch (60ms)
    llm.js                — fake LLM summary (120ms) with token + cost metadata
tests/
  users.test.js           — 6 integration tests
```

## Why this exists

Per `specs/001-phase1-sdk-foundation/`, Phase 1 ships the SDK + this demo.
The SC-005 success criterion is "a developer can `git clone`, `npm install`,
and `npm run demo` in under 5 minutes" — this directory is that proof.
