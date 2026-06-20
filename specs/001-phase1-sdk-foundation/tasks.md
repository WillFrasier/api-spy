---
description: "Task list for Phase 1 SDK Foundation"
---

# Tasks: Phase 1 SDK Foundation

**Input**: Design documents from `/specs/001-phase1-sdk-foundation/`
**Prerequisites**: plan.md (required), spec.md (required), research.md,
data-model.md, contracts/

**Tests**: REQUIRED — Principle IV (Test-First) is non-negotiable. Every
implementation task is preceded by a failing test task. Tests are
written with Node's built-in `node:test`.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story. User stories come from
`spec.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, structure, and the move of legacy
code out of the way.

- [ ] T001 Create `legacy/` and move `server/`, `extension/`, `test-project/`
      into it with `git mv`; write `legacy/README.md` pointing at the new
      `packages/` and `examples/` layout
- [ ] T002 Create `packages/api-spy/` directory and initialize
      `package.json` with `"type": "module"`, `"name": "api-spy"`,
      `"version": "0.1.0"`, `"main": "./src/index.js"`,
      `"exports": { ".": "./src/index.js" }`, scripts (`test`, `lint`),
      and dev deps (`supertest` ^7, `ajv` ^8, `ajv-formats` ^3,
      `eslint`, `eslint-config-standard`); document in T013 that the
      contract test imports the schemas with `require('ajv/dist/2020')`
      to match the Draft 2020-12 `$schema` declaration
- [ ] T003 [P] Create `examples/demo-app/` directory and initialize
      `package.json` with `"type": "module"`, `"private": true`,
      `"scripts": { "demo": "node src/server.js" }`, deps
      (`express` ^4, `api-spy` via `file:../../packages/api-spy`)
- [ ] T004 [P] Add root `.gitignore` entries: `node_modules/`, `*.log`,
      `.eslintcache`, `coverage/`, `dist/`
- [ ] T005 [P] Add root `README.md` pointing at the SDK and demo app

**Checkpoint**: `git status` shows moved legacy files and two new empty
package directories.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user
story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T006 Implement `packages/api-spy/src/log.js` — single function
      `log(level, msg, ctx)` that prefixes `[api-spy]` and includes
      `requestId=<id>` when called inside a request context
- [ ] T007 [P] Write `packages/api-spy/tests/unit/log.test.js` FIRST
      (asserts the prefix and that the level is preserved)
- [ ] T008 Implement `packages/api-spy/src/store.js` — `createInMemoryStore(capacity)`
      returning `{ save, get, dispose }` with LRU eviction (insertion-order
      `Map`); on eviction emit `[api-spy] evicted requestId=<id>`
- [ ] T009 [P] Write `packages/api-spy/tests/unit/store.test.js` FIRST
      (asserts: round-trip, capacity-1 inserts do not evict, capacity-th
      insert evicts oldest, `get()` of evicted returns `undefined`)
- [ ] T010 Implement `packages/api-spy/src/context.js` — exports
      `run(fn)` and `getRequestId()` using a module-level
      `AsyncLocalStorage` instance; `run()` generates the id with
      `crypto.randomUUID()`, captures `startTime`, and exposes a context
      object `{ id, startTime, queries: [] }`
- [ ] T011 [P] Write `packages/api-spy/tests/unit/context.test.js` FIRST
      (asserts: id is v4 UUID, `getRequestId()` is `null` outside `run()`,
      is the same id inside `run()`, is preserved across `await`,
      `setTimeout`, and nested calls)
- [ ] T012 Implement `packages/api-spy/src/index.js` — public exports
      `run`, `track` (re-exported from `track.js`), `getRequestId`,
      `init`, `express`
- [ ] T013 Add a contract test
      `packages/api-spy/tests/contract/api-debugger-response.test.js`
      that loads `contracts/api-debugger-response.schema.json`,
      `contracts/api-debugger-error.schema.json`, and
      `contracts/api-debugger-response.example.json`; asserts the example
      validates against the success schema

**Checkpoint**: `cd packages/api-spy && npm test` runs the log, store,
context, and contract tests, and all pass.

---

## Phase 3: User Story 1 - Instrument a slow operation (Priority: P1) 🎯 MVP

**Goal**: `apiSpy.track(name, fn, opts?)` records a query, resolves to
the inner value, propagates inner rejections, and supports nesting.

**Independent Test**: Run
`packages/api-spy/tests/unit/track.test.js` alone with
`node --test tests/unit/track.test.js` and confirm all assertions pass.

### Tests for User Story 1

> NOTE: Write these tests FIRST, ensure they FAIL before implementation

- [ ] T014 [P] [US1] Contract test: a happy-path `track()` resolves to the
      inner return value and the recorded query has `name`, `startTime`,
      `endTime`, `durationInMilliseconds >= 0`, `status: 'ok'`,
      `error: null`
- [ ] T015 [P] [US1] Failure test: a `track()` whose fn throws has
      `status: 'error'`, `error.message` populated, and the throw
      propagates to the caller
- [ ] T016 [P] [US1] Sync-throw test: `track('foo', () => { throw new Error() })`
      also records an error entry and re-throws
- [ ] T017 [P] [US1] Nesting test: an inner `track()` inside an outer
      `track()` records BOTH queries; the inner has `parentQueryId`
      equal to the outer's id
- [ ] T018 [P] [US1] Metadata test: `track('a', fn, { metadata: { x: 1 } })`
      persists `metadata: { x: 1 }` on the query

### Implementation for User Story 1

- [ ] T019 [US1] Implement `packages/api-spy/src/track.js` with `track(name, fn, opts?)`
      that reads the active context, pushes a new `Query` onto
      `ctx.queries` BEFORE running, then runs `fn`, captures
      start/end/duration, status, and error (depends on T006, T010)
- [ ] T020 [US1] In `track.js`, ensure that nested calls detect their
      parent query id by walking the most recent unfinished query on the
      stack — implement a small "open queries" array on the context for
      this; document the invariant in a JSDoc comment

**Checkpoint**: `node --test tests/unit/track.test.js` passes; the SDK
exposes a working `track()` end-to-end.

---

## Phase 4: User Story 2 - Correlate work across async boundaries (Priority: P1)

**Goal**: `getRequestId()` returns the active id from inside `run()` and
`null` outside.

**Independent Test**: Run `tests/unit/context.test.js` — already written
in Phase 2. This story's acceptance is satisfied by T011.

### Tests for User Story 2

- [ ] T021 [P] [US2] Additional test: `getRequestId()` called inside a
      `setTimeout` from inside `run()` returns the active id
      (in `tests/unit/context.test.js`)

### Implementation for User Story 2

- [ ] T022 [US2] Implementation is T010 + T011. No additional code
      needed unless T021 fails — in which case, replace the
      `AsyncLocalStorage` instance with a context that is also stored
      on `globalThis.__api_spy__` as a fallback for environments where
      ALS loses context (and document why).

**Checkpoint**: T011 + T021 pass.

---

## Phase 5: User Story 3 - Tag requests with the correlation header (Priority: P1)

**Goal**: `apiSpy.express()` middleware sets `X-ApiSpy-RequestId` on every
response and runs the request inside an `apiSpy.run()` context.

**Independent Test**: Run
`packages/api-spy/tests/integration/express.test.js` with
`node --test tests/integration/express.test.js`.

### Tests for User Story 3

- [ ] T023 [P] [US3] Integration test (FR-006): supertest hits a test
      Express app that uses `apiSpy.express()`; assert the response has
      `X-ApiSpy-RequestId` matching the v4 UUID regex
- [ ] T024 [P] [US3] Integration test: a route handler calls
      `apiSpy.getRequestId()` and the result equals the response header
- [ ] T025 [P] [US3] Integration test: two parallel supertest requests
      each get a distinct id (no cross-contamination)
- [ ] T026 [P] [US3] Integration test: a client-supplied
      `X-ApiSpy-RequestId` request header is overwritten by the
      middleware

### Implementation for User Story 3

- [ ] T027 [US3] Implement `packages/api-spy/src/express.js` — exports
      `express()` returning an Express middleware that
      (1) generates a UUID, (2) calls `res.setHeader('X-ApiSpy-RequestId', id)`,
      (3) wraps `next()` in `apiSpy.run(() => new Promise((resolve, reject) => { ... }))`,
      (4) on `res.on('finish')` finalizes the request record and writes it
      to the store, (5) on `res.on('error')` does the same with
      `status: 'error'`

**Checkpoint**: `tests/integration/express.test.js` passes.

---

## Phase 6: User Story 4 - Retrieve a request tree via HTTP (Priority: P1)

**Goal**: The SDK exposes an Express handler factory (or just the data)
so the demo app can serve `GET /api/v1/apiDebugger/:id` correctly.

**Independent Test**: `examples/demo-app/tests/users.test.js` (which
exercises the full loop including the debugger endpoint) plus a
dedicated contract test in the SDK.

### Tests for User Story 4

- [ ] T028 [P] [US4] SDK-level test: with an explicit `Store` and a
      manually-saved record, the contract test from T013 covers
      serialization; add a test that `JSON.parse(JSON.stringify(record))`
      round-trips
- [ ] T029 [P] [US4] SDK-level test: an id not in the store returns
      `undefined` from `store.get(id)` (consumed by the demo route to
      produce `404`)

### Implementation for User Story 4

- [ ] T030 [US4] Implement `examples/demo-app/src/routes/debugger.js` —
      Express handler that:
      (1) validates `:id` is a string of length ≤ 128 and matches a
      permissive UUID-ish regex; on failure respond `400` with the
      error schema
      (2) calls `apiSpy._store().get(id)`; on `undefined` respond `404`
      with the error schema
      (3) otherwise respond `200` with the success schema (depends on
      an internal `_store()` accessor — see T031)
- [ ] T031 [US4] Add `apiSpy._store()` accessor in
      `packages/api-spy/src/index.js` that returns the currently
      initialized store (underscore prefix documents that it is for
      in-process consumers like the demo route, not for external use)
- [ ] T032 [US4] Validate the demo's live response against
      `contracts/api-debugger-response.schema.json` in
      `examples/demo-app/tests/users.test.js`

**Checkpoint**: Contract test + integration test pass; the
demo's debugger route is wired.

---

## Phase 7: User Story 5 - Use a working demo to validate the loop (Priority: P2)

**Goal**: A developer can `git clone`, `npm install`, `npm run demo`,
hit one URL, and see the request tree at the debugger endpoint.

**Independent Test**: `examples/demo-app/tests/users.test.js` passes
end-to-end.

### Tests for User Story 5

- [ ] T033 [P] [US5] Integration test: `GET /api/v1/users/42` returns
      `200` with a JSON body shaped like `{ id, name }`, and the
      response carries an `X-ApiSpy-RequestId`
- [ ] T034 [P] [US5] Integration test: after the users call, the
      debugger endpoint with the same id returns a record with
      `queries.length === 3` (one DB, one HTTP, one LLM)
- [ ] T035 [P] [US5] Integration test: hitting the debugger endpoint
      with a non-existent id returns `404` with the error schema
- [ ] T036 [P] [US5] Concurrency test: 100 parallel supertest requests
      each get distinct ids; the union of recorded query counts equals
      100 × 3 (zero cross-contamination — covers SC-004)

### Implementation for User Story 5

- [ ] T037 [US5] Implement `examples/demo-app/src/fakes/db.js`,
      `http.js`, `llm.js` — each exports a single async function
      (`findUser(id)`, `fetchProfile(id)`, `summarize(user)`) wrapped in
      `apiSpy.track()` with realistic names and small `setTimeout`-based
      delays (10–50 ms)
- [ ] T038 [US5] Implement `examples/demo-app/src/routes/users.js` —
      `GET /:id` that calls all three fakes and returns
      `{ id: req.params.id, name: user.name, summary }`
- [ ] T039 [US5] Implement `examples/demo-app/src/server.js` —
      bootstraps Express, mounts `apiSpy.express()` first, then
      `/api/v1/users` and `/api/v1/apiDebugger/:id`
- [ ] T040 [US5] Write `examples/demo-app/README.md` with the
      quickstart (mirror of `specs/.../quickstart.md`)
- [ ] T041 [US5] Wire `examples/demo-app/package.json` `"scripts"`:
      `"demo": "node src/server.js"`, `"test": "node --test tests/"`

**Checkpoint**: `cd examples/demo-app && npm test` passes; `npm run demo`
starts the server and the curl flow in `quickstart.md` works.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Finalization, lint, docs, validation.

- [ ] T042 [P] Configure `eslint.config.js` at the repo root using
      `eslint-config-standard`; ensure `npm run lint` works in both
      packages (note: `eslint-config-standard@17` peers `eslint@8`, not
      `eslint@9` — pin `eslint@^8.57` if a standard-style config is
      desired, or use `@eslint/js` flat config without `standard`)
- [ ] T043 [P] Add `LICENSE` (ISC) at the repo root
- [ ] T044 [P] Add `CHANGELOG.md` at the repo root noting Phase 1 as
      `0.1.0` and listing the public API surface
- [ ] T045 [P] Write `packages/api-spy/README.md` with API reference
      (every export documented with a runnable example)
- [ ] T046 Run `npm test` in both packages and capture output as proof of
      SC-001; commit
- [ ] T047 Run `bash .specify/scripts/bash/check-prerequisites.sh` to
      confirm tooling alignment; if it reports missing tools, address
      them
- [ ] T048 Run `/speckit.analyze` (manual, by hand if the slash command
      is not wired in this environment) over spec/plan/tasks to catch
      cross-artifact drift; fix any gaps before declaring done

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phases 3–7)**: All depend on Foundational completion
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Phase 3)**: No dependencies on other stories
- **US2 (Phase 4)**: No dependencies; mostly satisfied by Phase 2 tests
- **US3 (Phase 5)**: Independent of US1/US2 but uses the same `run()` infrastructure
- **US4 (Phase 6)**: Depends on US3 (the debugger route lives in the demo but the contract is from the SDK)
- **US5 (Phase 7)**: Depends on US3 + US4

### Within Each User Story

- Tests are written and FAIL before implementation
- Pure helpers (log, store) before context before track
- SDK pieces before demo pieces
- Story complete and tests green before moving on

### Parallel Opportunities

- T002, T003, T004, T005 (Setup) can all run in parallel
- T007, T009, T011 (Phase 2 test tasks) can run in parallel with their
  respective implementations as soon as the implementations land
- All T014–T018 (US1 tests) can be written in parallel before T019/T020
- T023–T026 (US3 tests) can be written in parallel
- T033–T036 (US5 tests) can be written in parallel

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1 (Setup)
2. Complete Phase 2 (Foundational)
3. Complete Phase 3 (US1) — first independently testable slice
4. Complete Phase 4 (US2) — context correlation confirmed
5. **STOP and VALIDATE**: `npm test` in `packages/api-spy` is green

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 (track works) → SDK is now usable from a Node script
3. US3 (Express middleware) → SDK is now usable from an Express app
4. US4 (debugger endpoint) → request tree is now retrievable
5. US5 (demo app) → a developer can clone and see it work

### Checkpoint Discipline

At every phase boundary listed above, stop and run `npm test`. Do not
move on with red tests. Do not add new tests during a phase that are
not for that phase's user story (defer to a follow-on spec).
