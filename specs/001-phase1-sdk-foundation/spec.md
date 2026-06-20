# Feature Specification: Phase 1 SDK Foundation

**Feature Branch**: `001-phase1-sdk-foundation`
**Created**: 2026-06-19
**Status**: Draft
**Input**: User description: "Phase 1 foundation: api-spy SDK on AsyncLocalStorage, in-memory storage, HTTP debugger endpoint, demo Express app"

## Context

api-spy is a Node debugger that runs in the browser and shows the live graph
of slow backend work (HTTP calls, database queries, LLM calls) performed for
each top-level request. The repo contains a half-finished Chrome extension and
two abandoned server-side sketches (one on `continuation-local-storage`, one on
`request-local-storage`) that disagree with each other and with the extension.

This spec covers **Phase 1 only**: a working end-to-end foundation that proves
the architecture and can be demoed locally, deliberately deferring the
extension rewrite, MV3 migration, npm publish, and Redis storage to follow-on
specs.

The deliverable is a single local loop: install the SDK into a demo Express
app, make an HTTP request, see the request tree assembled in memory and
exposed at `GET /api/v1/apiDebugger/:id`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instrument a slow operation (Priority: P1)

As a Node application developer, I want to wrap any slow operation (DB query,
HTTP call, LLM call, expensive computation) with a single function call so
that api-spy records when it started, when it finished, how long it took, and
whether it succeeded or threw.

**Why this priority**: This is the entire value proposition of the SDK.
Without it, nothing downstream works. Every other story depends on it.

**Independent Test**: Run a unit test that calls
`apiSpy.track('getUser', async () => 42)` inside an `apiSpy.run()` context,
asserts the returned promise resolves to `42`, and asserts the recorded query
has `name: 'getUser'`, a `duration >= 0`, and `error: null`.

**Acceptance Scenarios**:

1. **Given** a Node process with `apiSpy.run(() => fn())` wrapping a request,
   **When** the inner code calls `await apiSpy.track('name', async () => result)`,
   **Then** the call resolves to `result` and a query entry is recorded with
   `name`, `startTime`, `endTime`, and `durationInMilliseconds`.
2. **Given** a `track()` call whose inner function throws,
   **When** the call rejects,
   **Then** the rejection propagates to the caller unchanged AND a query
   entry is recorded with `error.message` populated and `status === 'error'`.
3. **Given** nested `track()` calls inside the same `run()` context,
   **When** the outer and inner calls complete,
   **Then** both queries are recorded and the inner query has
   `parentQueryId` pointing at the outer query.

---

### User Story 2 - Correlate work across async boundaries (Priority: P1)

As a Node application developer, I want any code running under
`apiSpy.run()` — including awaited promises, microtasks, and `setTimeout`
callbacks — to share the same request id automatically, without manually
threading a context object through every function.

**Why this priority**: Manual context threading defeats the "lightweight,
drop-in" goal. This is the architectural reason we picked `AsyncLocalStorage`.

**Independent Test**: Run a test that opens an `apiSpy.run()` context, calls
`await apiSpy.track('a', async () => { await sleep(5); return apiSpy.getRequestId() })`
twice, and asserts both inner calls return the SAME request id.

**Acceptance Scenarios**:

1. **Given** code running inside `apiSpy.run()`,
   **When** it calls `apiSpy.getRequestId()` from a `setTimeout` callback,
   **Then** the returned id equals the id assigned by `run()`.
2. **Given** code running inside `apiSpy.run()`,
   **When** it calls `await apiSpy.track()` from inside another `track()`,
   **Then** the inner call inherits the same request id automatically.
3. **Given** code running OUTSIDE `apiSpy.run()`,
   **When** it calls `apiSpy.getRequestId()`,
   **Then** the call returns `null` and does not throw.

---

### User Story 3 - Tag requests with the correlation header (Priority: P1)

As a Node application developer using Express, I want an Express middleware
that assigns a request id, propagates it via the response header
`X-ApiSpy-RequestId`, and exposes it inside the request lifecycle so the
extension can correlate the browser-side fetch with the server-side trace.

**Why this priority**: Without the header contract the extension cannot pair
its observed fetches with the server-side data. It is the bridge between
the two halves of the product.

**Independent Test**: Spin up the demo app with `supertest`, hit `GET /hello`,
assert the response has header `X-ApiSpy-RequestId` matching
`/^[0-9a-f-]{36}$/`, and assert the id matches what the demo's instrumentation
recorded.

**Acceptance Scenarios**:

1. **Given** the demo app is running and the middleware is installed,
   **When** any HTTP request hits the app,
   **Then** the response carries a unique `X-ApiSpy-RequestId` header and the
   id is reachable from inside the route handler via `apiSpy.getRequestId()`.
2. **Given** two requests to the same route within the same process,
   **When** they complete,
   **Then** each has a distinct `X-ApiSpy-RequestId` and each request's
   recorded queries are isolated from the other's.

---

### User Story 4 - Retrieve a request tree via HTTP (Priority: P1)

As a Chrome extension (or `curl` user, or future SDK consumer), I want to
fetch the complete assembled tree of queries for a known request id from
`GET /api/v1/apiDebugger/:id` and receive JSON that matches the documented
contract, including per-query timing, errors, and parent/child relationships.

**Why this priority**: This is the contract the extension depends on. If the
shape is wrong, the extension can't render anything. Getting the contract
right here unblocks Phase 2.

**Independent Test**: Run the demo app, hit it with `supertest`, capture the
`X-ApiSpy-RequestId`, then hit `GET /api/v1/apiDebugger/:id` with that id,
and assert the response body validates against the JSON schema in
`specs/001-phase1-sdk-foundation/contracts/api-debugger-response.schema.json`.

**Acceptance Scenarios**:

1. **Given** a request with one or more `track()` calls completed,
   **When** `GET /api/v1/apiDebugger/:id` is called with the request id,
   **Then** the response is `200` with the documented JSON shape, including
   `requestId`, `timing.startTime`, `timing.endTime`,
   `timing.durationInMilliseconds`, and `queries[]`.
2. **Given** an unknown or already-evicted request id,
   **When** `GET /api/v1/apiDebugger/:id` is called,
   **Then** the response is `404` with a JSON error body
   `{"error": "not_found", "requestId": "..."}`.
3. **Given** malformed `id` (non-string, empty, > 128 chars),
   **When** `GET /api/v1/apiDebugger/:id` is called,
   **Then** the response is `400` with a JSON error body
   `{"error": "bad_request", "reason": "..."}`.

---

### User Story 5 - Use a working demo to validate the loop (Priority: P2)

As a developer evaluating api-spy, I want to `git clone`, run `npm install`
in one command, hit one URL, and see the assembled request tree at the
debugger endpoint — without configuring Redis, without setting up the
extension, without writing any instrumentation of my own.

**Why this priority**: This is the "show, don't tell" artifact. Without it,
no one will try the SDK. It is P2 because it depends on P1 stories but is
not on the critical path of the SDK itself.

**Independent Test**: From a fresh clone, run `npm run demo`. Hit
`http://localhost:3000/api/v1/users/42` with `curl`. Hit
`http://localhost:3000/api/v1/apiDebugger/<id-from-response-header>`. Observe
a non-empty `queries[]` containing the demo's instrumented calls. Tear down
with Ctrl-C.

**Acceptance Scenarios**:

1. **Given** a fresh clone with Node 18+,
   **When** the user runs `npm run demo` in `examples/demo-app`,
   **Then** the server starts on port 3000 within 5 seconds and logs
   `[api-spy] demo app listening on http://localhost:3000`.
2. **Given** the demo is running,
   **When** the user hits `GET /api/v1/users/:id` and then hits the
   debugger endpoint,
   **Then** the debugger response includes at least three recorded queries
   (one DB-shaped call, one HTTP-shaped call, one LLM-shaped call).
3. **Given** the demo is running,
   **When** the user hits the debugger endpoint with a non-existent id,
   **Then** the response is `404` and does not crash the server.

---

### Edge Cases

- **Concurrent requests**: 100 simultaneous requests to the demo MUST each
  see their own isolated `getRequestId()` value; queries from request A MUST
  NOT appear under request B.
- **Storage eviction**: When the in-memory store exceeds 1000 retained
  requests, the oldest are evicted (LRU); the evicted request id MUST return
  `404` thereafter, not stale data.
- **Crash mid-request**: If the route handler throws after starting a `track()`
  call, the `track()` entry MUST be recorded with `status: 'error'` and the
  rejection MUST still propagate; the SDK MUST NOT swallow the rejection.
- **Sync throw inside `track`**: A `track('foo', () => { throw new Error() })`
  call MUST mark the query as errored AND re-throw to the caller.
- **Process exit with active requests**: Any in-flight `run()` context on
  `beforeExit` MUST close its queries with `status: 'incomplete'` so the
  store never holds dangling open records.
- **Header injection**: If a malicious client sends a request with an
  `X-ApiSpy-RequestId` header, the middleware MUST overwrite it (do not trust
  client-supplied ids).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The SDK MUST export an `apiSpy` object with the methods:
  `run(fn)`, `track(name, fn, opts?)`, `getRequestId()`, `init(opts)`.
- **FR-002**: `apiSpy.run(fn)` MUST create a new request-scoped context,
  assign it a UUID v4 id, execute `fn()` with that context active, and
  return whatever `fn()` returns (promise or value).
- **FR-003**: `apiSpy.track(name, fn, opts?)` MUST record a query entry
  with `name`, ISO-8601 `startTime`, ISO-8601 `endTime`,
  `durationInMilliseconds` (integer >= 0), `status` (`ok` | `error` |
  `incomplete`), `error` (object or null), and the parent query id if any.
  It MUST resolve to whatever `fn()` resolves to, or reject with whatever
  `fn()` rejects with.
- **FR-004**: `apiSpy.getRequestId()` MUST return the active request id
  string when called inside `run()`, and MUST return `null` otherwise.
- **FR-005**: `apiSpy.init({ store })` MUST accept a storage adapter
  implementing `save(record)` and `get(id)`; the default in-memory adapter
  MUST bound capacity to 1000 records with LRU eviction.
- **FR-006**: The SDK MUST provide an Express middleware
  (`apiSpy.express()`) that sets `X-ApiSpy-RequestId` on every response,
  opens an `apiSpy.run()` context for the request lifecycle, and on
  `response.on('finish')` closes the request record and writes it to the
  store.
- **FR-007**: The demo app MUST expose `GET /api/v1/users/:id` that
  performs (and instruments) three calls: a fake DB read, a fake outbound
  HTTP fetch, and a fake LLM call.
- **FR-008**: The demo app MUST expose `GET /api/v1/apiDebugger/:id` that
  returns the recorded record or `404`.
- **FR-009**: All request and query records MUST be serializable to JSON
  with `JSON.stringify` without losing information (no functions, no
  circular references, no `undefined` fields).
- **FR-010**: The HTTP debugger endpoint MUST validate the `:id` parameter
  and return `400` for non-UUID-shaped values longer than 128 chars.
- **FR-011**: The SDK MUST NOT add runtime dependencies beyond Node
  built-ins (no `uuid` package; use `crypto.randomUUID`).
- **FR-012**: The SDK MUST emit a single `[api-spy]` log line on `init()`
  confirming the store type; it MUST NOT log on every request.

### Key Entities

- **Request**: a top-level unit of work opened by `run()`. Has `id`,
  `startTime`, `endTime`, `durationInMilliseconds`, `status`, `error`, and
  `queries[]`. Persisted to the store on `finish`.
- **Query**: a child operation recorded by `track()`. Has `name`,
  `parentQueryId` (nullable), `startTime`, `endTime`,
  `durationInMilliseconds`, `status`, `error`. Lives inside a `Request`.
- **Store**: a storage adapter. The default `InMemoryStore` is an LRU map
  keyed by request id. Future specs will add a `RedisStore`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `npm test` in the SDK package passes with 100% of the unit
  tests defined in `tests/unit/` and 100% of the integration tests in
  `tests/integration/` passing.
- **SC-002**: The demo app's `GET /api/v1/users/:id` completes in under
  200ms p95 on a developer laptop (the fake calls are sub-millisecond).
- **SC-003**: `GET /api/v1/apiDebugger/:id` returns a complete record in
  under 5ms p95 against the in-memory store.
- **SC-004**: 100 concurrent requests to the demo produce 100 distinct
  request ids with zero cross-contamination of recorded queries
  (verified by an integration test).
- **SC-005**: A developer with no prior context can clone the repo, run
  `npm run demo`, hit one `curl`, and see the request tree — in under
  5 minutes wall clock, with no additional setup.
- **SC-006**: The SDK's runtime dependency count is exactly zero (verified
  by `npm ls --prod` returning no packages).

## Assumptions

- Target runtime is Node 18 LTS or newer; `crypto.randomUUID` and
  `AsyncLocalStorage` are both available there without flags.
- The demo app and SDK both run in a single Node process. Cross-process
  correlation is a Phase 3 concern.
- The Chrome extension in `extension/api-spy-extension/` will be rewritten
  in a follow-on spec and is NOT a consumer of Phase 1.
- The only storage backend in Phase 1 is the in-memory store. Redis,
  Postgres, and any durable store are deferred.
- The HTTP debugger endpoint runs on the same Express instance as the
  demo routes. Standalone deployment of the endpoint is deferred.
- "LLM call" in the demo is simulated; no real OpenAI / Anthropic call is
  made. The shape is realistic enough to demonstrate the API.

## Out of Scope (deferred to follow-on specs)

- Chrome extension rewrite and MV3 migration.
- npm publish and versioned releases.
- Redis / durable storage adapters.
- Real outbound HTTP / LLM wrappers (`apiSpy.fetch`, `apiSpy.openai`).
- Process-to-process correlation (header-only propagation is sufficient
  for Phase 1).
- Authentication on the debugger endpoint.
- Live updates via WebSocket / SSE.
- Sampling and rate limiting.

## Phase Boundaries

This spec MUST be considered complete when:

1. The SDK package installs and `node --test tests/` passes locally.
2. The demo app starts and the two curl flows in Story 5 work end to end.
3. The contract schema in `contracts/api-debugger-response.schema.json`
   validates against the live response shape from the demo app.
4. All twelve functional requirements have an acceptance test.
