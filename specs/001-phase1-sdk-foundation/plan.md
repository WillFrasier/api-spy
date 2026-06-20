# Implementation Plan: Phase 1 SDK Foundation

**Branch**: `001-phase1-sdk-foundation` | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-phase1-sdk-foundation/spec.md`

## Summary

Build a working end-to-end foundation for api-spy: an ESM Node SDK that uses
`AsyncLocalStorage` to correlate work across async boundaries, an Express
middleware that opens a request context and tags responses with
`X-ApiSpy-RequestId`, an in-memory LRU storage adapter, and a demo Express
app that exercises the full loop. The Chrome extension, npm publish, Redis
storage, and real outbound HTTP/LLM wrappers are explicitly out of scope and
will be handled by follow-on specs.

## Technical Context

**Language/Version**: Node.js ≥ 18 LTS, ESM (`"type": "module"`), no transpilation

**Primary Dependencies**: zero runtime deps in the SDK core
(`crypto.randomUUID`, `node:async_hooks`, `node:test`). Dev deps:
`eslint`, `eslint-config-standard`, `supertest` (test only).

**Storage**: in-process LRU `Map`, capacity 1000, process-local

**Testing**: Node's built-in `node:test` runner + `assert/strict`. HTTP
integration via `supertest`. No Jest, no Mocha.

**Target Platform**: Linux/macOS developer laptops, Node 18+. The SDK itself
is platform-agnostic.

**Project Type**: monorepo of small npm packages. Phase 1 ships two:
`packages/api-spy` (the SDK) and `examples/demo-app` (the demo).

**Performance Goals**:
- `track()` overhead ≤ 10µs per call (negligible vs typical DB/HTTP latency)
- `getRequestId()` overhead ≤ 1µs (hot path; in-process lookup only)
- `GET /api/v1/apiDebugger/:id` p95 ≤ 5ms against in-memory store

**Constraints**:
- Zero npm runtime dependencies in `packages/api-spy`
- All public APIs are stable from day 1 (Phase 1 is treated as 1.0.0)
- No browser code, no transpilation, no bundler step

**Scale/Scope**:
- Two packages totaling ≤ 800 LOC excluding tests
- One demo app totaling ≤ 200 LOC
- 100% of FRs covered by at least one test each
- One JSON contract schema

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Library-First | ✅ | `api-spy` SDK and `demo-app` are separate packages with explicit `main`/`exports`. |
| II. Minimal-Footprint | ✅ | No globals, no monkey-patching, opt-in `track()` calls, single `[api-spy]` log line. |
| III. Contracts Over Coupling | ✅ | HTTP contract at `/api/v1/apiDebugger/:id` defined in `contracts/`; SDK does not import from extension or demo; demo does not import from SDK internals. |
| IV. Test-First | ✅ | Every FR has a test mapping in `tasks.md`; tests are written before implementation per task ordering. |
| V. Observability & Debuggability | ✅ | Structured error responses, single log prefix, request id on every error path. |

No constitution violations. No "Complexity Tracking" section needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-phase1-sdk-foundation/
├── plan.md                                          # this file
├── research.md                                      # Phase 0: tech decisions + alternatives
├── data-model.md                                    # Phase 1: Request/Query/Store schemas
├── quickstart.md                                    # Phase 1: 5-minute demo
├── contracts/
│   ├── api-debugger-response.schema.json           # JSON schema for the endpoint response
│   └── api-debugger-response.example.json           # golden response for the demo
└── tasks.md                                         # Phase 2: actionable task list
```

### Source Code (repository root)

The existing top-level `server/`, `extension/`, and `test-project/`
directories are **archived** in this phase (moved to `legacy/` with a
README pointing at the new layout) and **replaced** by the structure below.

```text
packages/
└── api-spy/                          # the SDK package (publishable)
    ├── package.json                  # name: api-spy, type: module, zero deps
    ├── README.md                     # quickstart + API reference
    ├── src/
    │   ├── index.js                  # public exports
    │   ├── context.js                # AsyncLocalStorage wrapper, run(), getRequestId()
    │   ├── track.js                  # track() implementation
    │   ├── store.js                  # InMemoryStore (LRU)
    │   ├── express.js                # express() middleware factory
    │   └── log.js                    # [api-spy] prefixed logger
    └── tests/
        ├── unit/
        │   ├── context.test.js       # US2 acceptance
        │   ├── track.test.js         # US1 acceptance
        │   ├── store.test.js         # LRU eviction
        │   └── log.test.js           # prefix invariant
        ├── contract/
        │   └── api-debugger-response.test.js   # validates JSON schema
        └── integration/
            └── express.test.js       # US3, US4 acceptance

examples/
└── demo-app/                         # the demo Express server
    ├── package.json                  # depends on api-spy (file: link) + express
    ├── README.md                     # "git clone && npm run demo"
    ├── src/
    │   ├── server.js                 # express bootstrap
    │   ├── routes/
    │   │   ├── users.js              # GET /api/v1/users/:id (instruments 3 fake calls)
    │   │   └── debugger.js           # GET /api/v1/apiDebugger/:id
    │   └── fakes/
    │       ├── db.js                 # apiSpy.track('db.<name>', async () => ...)
    │       ├── http.js               # apiSpy.track('http.<host>', async () => ...)
    │       └── llm.js                # apiSpy.track('llm.<model>', async () => ...)
    └── tests/
        └── users.test.js             # SC-005 acceptance: full curl flow via supertest

legacy/
├── README.md                         # points at new structure
├── server/                           # git-mv from ./server
├── extension/                        # git-mv from ./extension (will be rewritten in Phase 2)
└── test-project/                     # git-mv from ./test-project
```

**Structure Decision**: monorepo with two workspaces (the SDK package and
the demo example). No tooling added beyond what the spec demands — no
Turborepo, no Nx, no workspaces file. Each package is a standalone `npm
install` away from working. The SDK is published individually; the demo
remains an in-repo example.

## Phase Plan

### Phase 0: Research (delivered in `research.md`)

Resolve open technical questions before designing data shapes:

1. **AsyncLocalStorage ergonomics**: confirm `run(fn)` is sufficient for
   capturing the entire request lifecycle in Express (no manual `enterWith`
   needed).
2. **LRU implementation**: pick `Map`-based LRU (zero deps) vs vendoring a
   library. Decision: in-tree implementation in `store.js`.
3. **Express middleware ordering**: confirm the middleware must run BEFORE
   route handlers but AFTER body parsers. Document the constraint in the
   SDK README.
4. **JSON schema tooling**: pick `ajv` (test-only dep) for schema validation
   in the contract test. Alternative: hand-rolled validator. Decision:
   `ajv` for accuracy.
5. **UUID generation**: confirm `crypto.randomUUID()` is available on
   Node 18 without flags. (Yes — stable since Node 14.17.)

### Phase 1: Design (delivered in `data-model.md`, `contracts/`, `quickstart.md`)

1. **Data model**: `Request` and `Query` TypeScript-style shapes (in
   JSDoc) plus the `Store` interface contract.
2. **HTTP contract**: JSON schema for `GET /api/v1/apiDebugger/:id`
   success and error responses.
3. **Quickstart**: the exact sequence of `npm` commands and `curl`
   invocations to go from clone to seeing the request tree.

### Phase 2: Tasks (delivered in `tasks.md`)

Implementation tasks grouped by user story, each test-first, each
checkpointable independently. See `tasks.md`.

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `AsyncLocalStorage` loses context across some odd await chain | Low | Add a specific integration test for `setTimeout`, `queueMicrotask`, and `Promise.all`; if it breaks, fall back to a manual context object passed through. |
| Demo app's "fake" calls look too fake to be useful | Medium | Use realistic-shaped delays (10–50ms) and realistic-looking payloads. |
| Existing `server/` and `extension/` code interferes | Medium | Move to `legacy/` early in the work, before any new package is added. |
| Schema validator adds a dep | Low | `ajv` is a dev dep only, scoped to the contract test. |

## Complexity Tracking

> No constitution violations. Section intentionally empty.
