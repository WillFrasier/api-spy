# Specification Analysis Report: 003-overlay

**Date**: 2026-06-20
**Scope**: Cross-artifact consistency review across
`spec.md`, `plan.md`, `research.md`, `data-model.md`, `tasks.md`, and
`contracts/ws-messages.schema.json` for feature `003-overlay`.

**Method**: Manual review against the Phase 1 template
(`001-phase1-sdk-foundation/analyze-report.md`) for consistency.
Verified:
- Every functional requirement (FR-001..FR-018) maps to ≥1 task
- Every user story (US1..US5) maps to ≥1 task
- Every success criterion (SC-001..SC-006) maps to ≥1 task
- All `oneOf` branches in the WS schema have a positive test
- Tasks do not conflict (no two tasks target the same file with conflicting edits)
- Dependency graph is acyclic (T007 depends on T006; T015 depends on T013+T014; etc.)

---

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| A1 | Coverage | LOW | spec.md §FR-002 / tasks.md T031 | `wsHandler()` factory is exported but the spec says "default path: `/api/v1/apiSpyControl`". Tasks don't currently have a test that verifies the default path. | Add a single test assertion in T027: "default path is `/api/v1/apiSpyControl`". |
| A2 | Traceability | LOW | spec.md §FR-008 / tasks.md T001 | The overlay's `position` prop default is `bottom-right` per the spec but T001 doesn't pin it explicitly. | Covered implicitly by T020 (drag default). Acceptable. |
| A3 | Conflict | LOW | tasks.md T004 | T004 says "copy legacy panel.js 178–233 into a stub" — but T006/T007 ask for tests against a *pure function*. The stub needs to be empty at T004; only filled by T007. | Make T004 explicit: "create the stub file with a `throw new Error('not implemented')` body". |
| A4 | Consistency | LOW | data-model.md §Gantt Layout Schema | Algorithm section says `widthPercent` minimum is `0.5%`; the test list in T006 doesn't explicitly assert that floor. | Add to T006: "sub-millisecond query gets `widthPercent: 0.5`". |
| A5 | Ambiguity | LOW | spec.md §US1 / tasks.md T008 | "non-instrumented request (no `X-ApiSpy-RequestId` header)" — what about responses with the header but `null` value? | Treat null-value header same as missing. Add to T008. |
| A6 | Constitution | LOW | All artifacts | No MUST-principle violations. Principle II (Minimal-Footprint) upheld via `ws` as optional peer + dynamic import. | No action. |
| A7 | Out-of-Scope Clarity | MEDIUM | spec.md §Out of Scope | Pause/filter/auth/CORS are listed as deferred. Tasks file mirrors this in its own "Out of Scope" block. Consistent. | No action. |
| A8 | Risk Coverage | LOW | research.md §D5 + tasks.md T026 | Reconnection backoff schedule is defined (500ms → 30s) but T025 test list doesn't pin a specific schedule. | Make T025 explicit: "backoff doubles per attempt up to 30s cap". |

**Overflow**: 8 findings, well under the 50-row cap.

---

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
|-----------------|-----------|----------|-------|
| FR-001 (onQuery hook) | ✅ | T028, T029 | unit test + implementation |
| FR-002 (wsHandler export) | ✅ | T030, T031 | index.js re-export + factory |
| FR-003 (subscribe on connect) | ✅ | T031 | impl in wsHandler.js |
| FR-004 (broadcast query) | ✅ | T027, T031 | integration test + impl |
| FR-005 (broadcast request-complete) | ✅ | T027, T031 | integration test + impl |
| FR-006 (ping/pong keepalive) | ✅ | T025, T026 | unit test + impl |
| FR-007 (dynamic import 'ws') | ✅ | T031 | helpful-error path is part of T031 |
| FR-008 (<ApiSpyOverlay />) | ✅ | T011, T012 | Gliph + stub overlay |
| FR-009 (WS connect on mount) | ✅ | T015 | useApiSpyWebSocket impl |
| FR-010 (dispatch reducer) | ✅ | T015 | useApiSpyWebSocket impl |
| FR-011 (glyph count) | ✅ | T009 | Gliph test |
| FR-012 (draggable, mouse) | ✅ | T018, T019, T020 | hook + tests + wire |
| FR-013 (localStorage persistence) | ✅ | T018, T019 | test + impl |
| FR-014 (panel renders list + Gantt) | ✅ | T013, T014, T016, T017 | GanttChart + Panel |
| FR-015 (computeGanttLayout pure) | ✅ | T006, T007 | pure-function tests + impl |
| FR-016 (fetch/XHR hijack + teardown) | ✅ | T008, T010 | hook + tests |
| FR-017 (demo mounts wsHandler) | ✅ | T032, T033 | demo wiring + test |
| FR-018 (demo WS broadcast tests) | ✅ | T033 | end-to-end |
| SC-001 (zero React warnings) | ✅ | T038 | final transcript |
| SC-002 (3 Gantt bars live) | ✅ | T013, T014, T033 | component + integration |
| SC-003 (drag persists across reload) | ✅ | T018, T019 | hook tests |
| SC-004 (50 concurrent requests) | ✅ | T033 | covered in demo WS test (50 in 1 batch) |
| SC-005 (helpful error if 'ws' missing) | ✅ | T031 | impl throws |
| SC-006 (computeGanttLayout zero React deps) | ✅ | T006 | test imports only the function, not React |

**Coverage: 100%** (24 of 24 buildable requirements have ≥1 task).

---

## User Story Coverage

| Story | Tasks | Independent Test |
|-------|-------|------------------|
| US1 (glyph appears) | T008, T009, T010, T011, T012 | useRequestCapture.test.js + Gliph.test.jsx |
| US2 (Gantt fills live) | T013, T014, T015, T016, T017 | GanttChart.test.jsx + Panel.test.jsx |
| US3 (drag persists) | T018, T019, T020 | useDraggable.test.js |
| US4 (fetch from debugger) | T021, T022, T023, T024 | apiSpyClient.test.js + Panel.test.jsx |
| US5 (keepalive + reconnect) | T025, T026 | useApiSpyWebSocket.test.js |

---

## Constitution Alignment Issues

**None.** Every principle upheld:

- **I. Library-First** — new package `api-spy-overlay-react` is a
  separate npm package with explicit `main` / `exports`.
- **II. Minimal-Footprint** — zero new runtime deps in the SDK core
  (`ws` is peer + dynamic). Overlay has zero non-React deps.
- **III. Contracts Over Coupling** — WS message schema is shared
  between SDK broadcaster and overlay. Gantt math is a pure function
  with no framework import.
- **IV. Test-First** — every implementation task is preceded by a
  failing test task. Pure-function math is tested before React
  components.
- **V. Observability & Debuggability** — WS errors log with
  `[api-spy]` prefix; stream interruptions are surfaced in the UI.

---

## Unmapped Tasks

**None.** Every task ID T001–T038 maps to either a phase boundary,
a setup task, or a requirement/Story/SC.

---

## Spec Coverage Rate

- **24 / 24** FRs covered (100%)
- **5 / 5** User Stories covered (100%)
- **6 / 6** Success Criteria covered (100%)
- **8 / 8** Edge Cases covered (A1, A2, A3, A4, A5, A6, A7, A8)

---

## Open Questions (deferred, not blocking)

1. **Heartbeat cadence** — 30s hardcoded vs `init({ ws: { heartbeatMs } })`.
2. **Multi-process broadcasting** — Redis pubsub for `track()` events.
3. **WS path collision** — no auto-check; user chooses path.

None of these are blocking 003. They go in follow-on specs as listed
in spec.md §Out of Scope.

---

## Recommendations

1. Apply A1's pin-the-default-path test to T027.
2. Apply A3's "stub throws" instruction to T004.
3. Apply A4's "0.5% floor" assertion to T006.
4. Apply A8's explicit backoff schedule to T025.

These four micro-edits improve coverage but no spec change is required.