# Requirements Quality Checklist: Phase 1 SDK Foundation

**Purpose**: Validate the quality, completeness, and clarity of the
requirements written in `spec.md`, `plan.md`, `research.md`, `data-model.md`,
and `contracts/` for Phase 1. This checklist tests the requirements
themselves — not the implementation that will be built from them.

**Created**: 2026-06-19
**Feature**: 001-phase1-sdk-foundation

---

## Requirement Completeness

- [ ] CHK001 — Are all public SDK exports (`run`, `track`, `getRequestId`,
      `init`, `express`) explicitly named in the spec? [Completeness,
      Spec §FR-001, data-model.md §API Surface]
- [ ] CHK002 — Is the in-memory store capacity (1000) and eviction policy
      (LRU, oldest-first) explicitly specified? [Completeness, Spec
      §FR-005, data-model.md §Capacity & Eviction]
- [ ] CHK003 — Is the HTTP debugger endpoint validation behavior
      (length cap, regex shape, error response shape) fully specified
      including the 400/404 distinction? [Completeness, Spec §FR-010,
      contracts/api-debugger-error.schema.json]
- [ ] CHK004 — Is the header name `X-ApiSpy-RequestId` (case-sensitive,
      with exact spelling) defined in exactly one place and referenced
      consistently across spec/plan/data-model/contracts? [Completeness,
      Consistency, Spec §FR-006]
- [ ] CHK005 — Is the response body shape for `GET /api/v1/apiDebugger/:id`
      covered by a JSON schema file (success AND error variants)? [Gap,
      contracts/]
- [ ] CHK006 — Are the three demo "fake" call types (DB, HTTP, LLM) and
      their naming convention (`db.`, `http.`, `llm.`) defined? [Completeness,
      Spec §FR-007]

## Requirement Clarity

- [ ] CHK007 — Is the term "lightweight" in the user's original framing
      quantified in the spec? (e.g., "≤ 10µs overhead per track() call")
      [Clarity, Spec §Performance Goals in plan.md]
- [ ] CHK008 — Is "in-memory store" defined with concrete capacity,
      eviction semantics, and lifecycle (process-scoped, lost on exit)?
      [Clarity, data-model.md §Capacity & Eviction]
- [ ] CHK009 — Is the meaning of `status: 'incomplete'` (used on process
      exit with active requests) explained in user-readable terms, not
      just listed as an enum value? [Clarity, Spec §Edge Cases]
- [ ] CHK010 — Is "realistic-shaped delays (10–50 ms)" in the demo
      justified — i.e., why those numbers vs. zero or random? [Clarity,
      plan.md §Risks]
- [ ] CHK011 — Is "metadata" on a `Query` documented as opaque
      (user-defined shape, SDK does not validate)? [Clarity, data-model.md
      §Serialization Rules]

## Requirement Consistency

- [ ] CHK012 — Do `data-model.md` and `contracts/api-debugger-response.schema.json`
      agree on field names, types, and required-ness for every field?
      [Consistency]
- [ ] CHK013 — Does the spec say zero runtime deps AND the plan confirm
      zero runtime deps AND the tasks not introduce a `uuid` / `nanoid`
      dependency? [Consistency, Spec §FR-011, plan.md §Primary Dependencies,
      tasks.md T002]
- [ ] CHK014 — Is the SDK public API consistent between
      `data-model.md §API Surface` and `spec.md §FR-001`? [Consistency]
- [ ] CHK015 — Do the task IDs in `tasks.md` reference the spec IDs
      they implement (e.g., T014–T018 cite FR-001 / FR-003)? [Traceability]

## Acceptance Criteria Quality

- [ ] CHK016 — Is every user story in spec.md paired with at least one
      acceptance scenario in Given/When/Then form? [Measurability, Spec
      §User Stories 1–5]
- [ ] CHK017 — Is every success criterion (SC-001 through SC-006)
      testable by running a single command or observing a single metric?
      [Measurability, Spec §Success Criteria]
- [ ] CHK018 — Is SC-004 (100 concurrent requests, zero cross-contamination)
      defined with an exact assertion (e.g., "the union of recorded query
      counts equals 100 × 3")? [Measurability, Spec §SC-004, tasks.md T036]

## Scenario Coverage

- [ ] CHK019 — Are the primary flows (instrument a call, correlate across
      async, retrieve via HTTP, demo end-to-end) all covered? [Coverage,
      Spec §User Stories 1–5]
- [ ] CHK020 — Are the exception flows (sync throw, async reject, nested
      throw, store eviction, unknown id) covered? [Coverage, Spec §Edge
      Cases]
- [ ] CHK021 — Is the recovery / cleanup flow (process exit with open
      requests → mark `incomplete`) covered? [Coverage, Spec §Edge Cases]
- [ ] CHK022 — Are non-functional requirements (overhead budgets, p95
      latency, dependency count) captured explicitly as Success Criteria,
      not buried in prose? [Coverage, Spec §SC-001 to SC-006]

## Edge Case Coverage

- [ ] CHK023 — Is the "client supplies their own `X-ApiSpy-RequestId`"
      attack edge case (header overwrite) specified? [Edge Case, Spec
      §Edge Cases, tasks.md T026]
- [ ] CHK024 — Is the LRU eviction behavior specified for the
      "concurrent requests fill the store" scenario? [Edge Case, Spec
      §Edge Cases, tasks.md T009]
- [ ] CHK025 — Is the "store lost on process restart" behavior
      acknowledged as expected for Phase 1? [Edge Case, plan.md §Storage]

## Non-Functional Requirements

- [ ] CHK026 — Are performance budgets (≤ 10µs per track, ≤ 1µs per
      getRequestId, p95 ≤ 5ms for the endpoint, p95 ≤ 200ms for the
      demo route) all explicitly stated and tied to a success criterion?
      [Completeness, plan.md §Performance Goals]
- [ ] CHK027 — Is the security stance for the debugger endpoint
      (no authentication in Phase 1) explicitly stated? [Gap, Spec
      §Out of Scope]
- [ ] CHK028 — Is the observability behavior (single `[api-spy]` log
      line on init, `[api-spy] evicted requestId=<id>` on eviction) fully
      specified? [Completeness, Spec §FR-012]

## Dependencies & Assumptions

- [ ] CHK029 — Is the Node 18+ minimum version assumption stated and
      justified by a real feature (`crypto.randomUUID`,
      `AsyncLocalStorage`)? [Assumption, Spec §Assumptions]
- [ ] CHK030 — Is the assumption "single-process correlation only"
      stated explicitly and contrasted with the deferred "cross-process
      propagation" work? [Assumption, Spec §Assumptions, §Out of Scope]
- [ ] CHK031 — Is the choice of `ajv` (Draft 2020) documented as the
      validation library for the contract test, and is the import path
      `ajv/dist/2020` recorded (not just `ajv`)? [Dependency, plan.md
      §R4, tasks.md T002, T013]

## Ambiguities & Conflicts

- [ ] CHK032 — Does any document use the legacy header name
      `apirequestid` (from the old extension) instead of
      `X-ApiSpy-RequestId`? If yes, this is a conflict. [Conflict, legacy
      `extension/api-spy-extension/public/scripts/apiSpy.js:3`]
- [ ] CHK033 — Is the term "track" used consistently as a verb (the
      function name) and never as a noun? [Ambiguity, Spec §FR-003]
- [ ] CHK034 — Is there a single, unambiguous definition of what counts
      as a "request" (top-level `run()`) vs. a "query" (nested `track()`)?
      [Ambiguity, data-model.md §Core Types]

## Out-of-Scope Boundary

- [ ] CHK035 — Is the deferral of Chrome extension work, MV3 migration,
      Redis store, real LLM/HTTP wrappers, npm publish, WebSocket/SSE
      live updates, and authentication all captured in one place (Spec
      §Out of Scope) and NOT scattered across other sections? [Boundary,
      Spec §Out of Scope]
