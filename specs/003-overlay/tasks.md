---
description: "Task list for In-page debug overlay (003-overlay)"
---

# Tasks: In-page debug overlay (003-overlay)

**Input**: Design documents from `/specs/003-overlay/`
**Prerequisites**: plan.md (required), spec.md (required), research.md,
data-model.md, quickstart.md, contracts/

**Tests**: REQUIRED — Principle IV (Test-First) is non-negotiable. Every
implementation task is preceded by a failing test task. Tests are
written with `node:test` for the SDK and `node:test` + jsdom + React
Testing Library for the overlay.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story. User stories come from
`spec.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the new package, hook the SDK to broadcast query
events, scaffold the overlay package.

- [ ] T001 [P] Create `packages/api-spy-overlay-react/` directory with
      `package.json` (name: `api-spy-overlay-react`, `type: module`,
      `main: ./src/index.js`, `exports: { ".": "./src/index.js",
      "./styles.css": "./src/styles.css" }`, peer deps:
      `react >= 18.0.0`, dev deps: `react`, `react-dom`,
      `@testing-library/react`, `jsdom`, `@testing-library/jest-dom`)
- [ ] T002 [P] Add `ws` as an optional peer dependency in
      `packages/api-spy/package.json` (peerDependenciesMeta with
      `ws: { optional: true }`) and add `ws` to `devDependencies` for
      testing (range: `^8.0.0`)
- [ ] T003 [P] Create `examples/demo-app/` install of `ws` (so the demo
      can mount the WS handler) — already done if `ws` is hoisted via
      the SDK's peer dep
- [ ] T004 [P] Copy the Gantt math reference from
      `legacy/extension/api-spy-extension/public/scripts/panel.js` lines
      178–233 into a stub at
      `packages/api-spy-overlay-react/src/lib/computeGanttLayout.js`
      with a clear comment marking the source and the port date

**Checkpoint**: `ls packages/api-spy-overlay-react/` shows the
scaffold; `cd packages/api-spy && npm install` succeeds with `ws` as
an optional peer dep.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user
story can be implemented.

- [ ] T005 [P] Contract test:
      `packages/api-spy/tests/contract/ws-messages.test.js` loads
      `specs/003-overlay/contracts/ws-messages.schema.json` and
      asserts: a `query` message with the golden Query shape validates;
      a `request-complete` message with `status: 'ok'` validates; a
      `ping` validates; a `pong` validates; an unknown `type` is
      rejected; a malformed UUID `requestId` is rejected
- [ ] T006 [P] Write `packages/api-spy-overlay-react/tests/unit/computeGanttLayout.test.js`
      FIRST (asserts: empty input, single query, two parallel, two
      overlapping, errored query, sub-millisecond width, negative
      start clamped, overflow right edge clamped)
- [ ] T007 Implement `packages/api-spy-overlay-react/src/lib/computeGanttLayout.js`
      to make T006 pass — pure function, no DOM, no React
      (depends on T006)

**Checkpoint**: `cd packages/api-spy && npm test` runs the contract
test green; `cd packages/api-spy-overlay-react && npm test` runs the
`computeGanttLayout` tests green.

---

## Phase 3: User Story 1 - See a request glyph appear (Priority: P1) 🎯 MVP

**Goal**: Mounting the overlay produces a glyph that increments when an
instrumented HTTP response lands.

**Independent Test**: `packages/api-spy-overlay-react/tests/component/ApiSpyOverlay.test.jsx`
— render with mocked WS, simulate a `query` message, assert glyph
badge updates.

### Tests for User Story 1

> NOTE: Write these tests FIRST, ensure they FAIL before implementation

- [ ] T008 [P] [US1] Unit test:
      `packages/api-spy-overlay-react/tests/unit/useRequestCapture.test.js`
      covers: hijack installs on `window.fetch`, response with
      `x-apispy-requestid` header triggers callback, response without
      header does not, unmount restores original `fetch`, second
      install throws (double-install guard)
- [ ] T009 [P] [US1] Component test:
      `packages/api-spy-overlay-react/tests/component/Gliph.test.jsx`
      covers: glyph renders with count 0 by default, count updates
      when `requests.length` changes, click toggles `isOpen`

### Implementation for User Story 1

- [ ] T010 [US1] Implement
      `packages/api-spy-overlay-react/src/hooks/useRequestCapture.js` —
      wraps `window.fetch` and `XMLHttpRequest.prototype.{open,send}`,
      restores on unmount, throws on double-install (depends on T008)
- [ ] T011 [US1] Implement
      `packages/api-spy-overlay-react/src/components/Gliph.jsx` —
      renders a button with the request count, click toggles
      `isOpen` (depends on T009)
- [ ] T012 [US1] Implement
      `packages/api-spy-overlay-react/src/components/ApiSpyOverlay.jsx`
      (stub) — composes `useRequestCapture` + `<Gliph>`, renders only
      the glyph for US1

**Checkpoint**: `cd packages/api-spy-overlay-react && npm test` passes
the T008, T009, T011 unit + component tests; glyph appears in a jsdom
render and increments on captured fetch.

---

## Phase 4: User Story 2 - Open the Gantt panel for an in-flight request (Priority: P1)

**Goal**: Clicking a request opens a panel showing a Gantt chart that
fills in as WS `query` events arrive.

**Independent Test**: `tests/component/Panel.test.jsx` + `GanttChart.test.jsx` —
mock WS, push 3 `query` events, assert 3 Gantt bars in correct positions.

### Tests for User Story 2

- [ ] T013 [P] [US2] Component test:
      `packages/api-spy-overlay-react/tests/component/GanttChart.test.jsx`
      covers: renders one row per query, bars positioned by
      `computeGanttLayout` output, errored queries get the error class,
      empty queries renders an empty state
- [ ] T014 [P] [US2] Component test:
      `packages/api-spy-overlay-react/tests/component/Panel.test.jsx`
      covers: lists captured requests, clicking a row selects it,
      selected request renders `<GanttChart>` with its queries

### Implementation for User Story 2

- [ ] T015 [US2] Implement
      `packages/api-spy-overlay-react/src/hooks/useApiSpyWebSocket.js` —
      opens WS to `${origin}/api/v1/apiSpyControl`, parses incoming
      frames against the WS schema, dispatches into a reducer; on close
      reconnects with exponential backoff (500ms → 30s); sends a
      `ping` every 25s; uses a `WebSocket` mock in tests
- [ ] T016 [US2] Implement
      `packages/api-spy-overlay-react/src/components/GanttChart.jsx` —
      takes a `queries[]` prop, calls `computeGanttLayout`, renders
      rows + bars + labels (depends on T007, T013)
- [ ] T017 [US2] Implement
      `packages/api-spy-overlay-react/src/components/Panel.jsx` —
      renders the request list + the selected request's Gantt (depends
      on T014, T016)

**Checkpoint**: US2 component tests pass. The panel renders a Gantt
chart that fills in as WS events arrive.

---

## Phase 5: User Story 3 - Drag the glyph to reposition it (Priority: P2)

**Goal**: Mouse-drag the glyph; position persists in localStorage.

**Independent Test**: `tests/unit/useDraggable.test.js` + `Gliph.test.jsx`
drag assertions.

### Tests for User Story 3

- [ ] T018 [P] [US3] Unit test:
      `packages/api-spy-overlay-react/tests/unit/useDraggable.test.js`
      covers: mousedown on target starts drag, mousemove updates
      position, mouseup ends drag and persists, position clamped to
      viewport bounds, persisted position loaded on next mount

### Implementation for User Story 3

- [ ] T019 [US3] Implement
      `packages/api-spy-overlay-react/src/hooks/useDraggable.js` —
      mouse-event-based drag, viewport clamping, localStorage
      persistence at `api-spy-overlay:position`, falls back to default
      if persisted position is off-screen (depends on T018)
- [ ] T020 [US3] Wire `useDraggable` into `<Gliph>` so the glyph is
      draggable and reads/writes its position from the hook

**Checkpoint**: US3 unit + component tests pass. Drag end-to-end works
in jsdom.

---

## Phase 6: User Story 4 - Fetch the captured record from the debugger endpoint (Priority: P2)

**Goal**: Clicking a request fetches `/api/v1/apiDebugger/:id` and
renders the full tree (filling any WS gaps).

**Independent Test**: `tests/unit/apiSpyClient.test.js` — mock
`global.fetch`, assert correct URL + JSON parse + error path.

### Tests for User Story 4

- [ ] T021 [P] [US4] Unit test:
      `packages/api-spy-overlay-react/tests/unit/apiSpyClient.test.js`
      covers: GETs `${origin}/api/v1/apiDebugger/${id}`, parses JSON
      response, returns the body, throws on non-2xx with the status
      text
- [ ] T022 [P] [US4] Component test addition to `Panel.test.jsx`:
      clicking a row triggers the fetch and renders the fetched
      queries when the WS stream is empty

### Implementation for User Story 4

- [ ] T023 [US4] Implement
      `packages/api-spy-overlay-react/src/lib/apiSpyClient.js` — fetch
      wrapper with JSON parsing and error mapping (depends on T021)
- [ ] T024 [US4] Wire `apiSpyClient.fetchRecord(id)` into `<Panel>`
      so clicking a request fetches the full record and merges into
      the local query list (depends on T022)

**Checkpoint**: US4 unit + component tests pass. End-to-end: fetch the
debugger endpoint from jsdom and render the Gantt.

---

## Phase 7: User Story 5 - Bidirectional keepalive works (Priority: P3)

**Goal**: WS survives long idle periods and reconnects after drops.

**Independent Test**: `tests/unit/useApiSpyWebSocket.test.js` (extend
the T015 mock) — simulate WS close, assert reconnect with backoff,
simulate `ping`/`pong` round-trip.

### Tests for User Story 5

- [ ] T025 [P] [US5] Unit test extension to `useApiSpyWebSocket.test.js`:
      close → reconnect after backoff; multiple consecutive closes →
      backoff doubles up to 30s cap; first successful message resets
      the backoff; `ping` is sent every 25s when connection is open;
      `pong` resets the ping timer

### Implementation for User Story 5

- [ ] T026 [US5] Backoff state + ping/pong timer in
      `useApiSpyWebSocket.js`. Refactor the reconnect logic from T015
      into a separate `useReconnectingWebSocket(url)` helper if it
      keeps the file readable. (depends on T025)

**Checkpoint**: US5 unit tests pass. The overlay survives server
restarts and 2-minute idle periods.

---

## Phase 8: SDK WebSocket handler

**Purpose**: The server side that pushes the events the overlay
consumes. Tasks T027–T031 are the server-side counterparts to US1/US2
and live in `packages/api-spy`.

### Tests for the SDK WS handler

- [ ] T027 [P] [SDK-WS] Integration test:
      `packages/api-spy/tests/integration/wsHandler.test.js` covers:
      Express app with `apiSpy.wsHandler()` mounted; a `ws` client
      connects; a `track()` call from inside an instrumented handler
      pushes a `query` message to the client (verified via Promise
      resolved by client message handler); ping → pong round-trip
      works; multiple clients each receive every broadcast
- [ ] T028 [P] [SDK-WS] Unit test:
      `packages/api-spy/tests/unit/onQuery.test.js` covers: `init({ onQuery })`
      sets the hook; a `track()` call invokes the hook with `(ctx, query)`;
      the hook is not invoked if not set; the hook is not invoked
      outside a `run()` context

### Implementation for the SDK WS handler

- [ ] T029 [SDK-WS] Modify
      `packages/api-spy/src/track.js` to invoke the registered `onQuery`
      hook after each query finalizes (depends on T028)
- [ ] T030 [SDK-WS] Modify
      `packages/api-spy/src/index.js` to add `init({ onQuery })` and
      re-export `wsHandler` from `./wsHandler.js`
- [ ] T031 [SDK-WS] Implement
      `packages/api-spy/src/wsHandler.js` — dynamic-imports `ws`,
      throws helpful error if not installed; upgrades incoming
      requests; broadcasts `query` / `request-complete` messages;
      handles `ping`/`pong`; cleanup on close (depends on T027, T029,
      T030)

**Checkpoint**: SDK WS handler integration tests pass. A `track()`
call from inside an instrumented route reaches a `ws` client within
10ms.

---

## Phase 9: Demo app wiring

**Purpose**: Mount the WS handler in the demo app and add the demo's
WS integration tests.

- [ ] T032 [P] [DEMO] Modify
      `examples/demo-app/src/server.js` to mount
      `apiSpy.wsHandler()` at `/api/v1/apiSpyControl`
- [ ] T033 [P] [DEMO] Integration test:
      `examples/demo-app/tests/wsHandler.test.js` covers: WS connection
      to the demo's `/api/v1/apiSpyControl`; hitting
      `GET /api/v1/users/42` triggers 3 `query` messages + 1
      `request-complete` on the WS client; ping/pong works
- [ ] T034 [P] [DEMO] Update `examples/demo-app/README.md` to
      document the WS quickstart (`npm run demo` + a `wscat` or
      `websocat` command for inspecting the live stream)

**Checkpoint**: `cd examples/demo-app && npm test` runs the WS test
green. `npm run demo` then `wscat -c ws://localhost:3000/api/v1/apiSpyControl`
in another shell streams query events for every request.

---

## Phase 10: Polish

**Purpose**: Styling, README, ESLint. Mirror the Phase 1 polish pass.

- [ ] T035 [P] [POLISH] Author
      `packages/api-spy-overlay-react/src/styles.css` — glyph (40px
      circle, brand color, subtle shadow, hover lift), panel (right-
      anchored, scrollable list, Gantt grid CSS lifted from legacy
      `panel.html`), dark theme tokens
- [ ] T036 [P] [POLISH] Author
      `packages/api-spy-overlay-react/README.md` — quickstart, props
      table, screenshot placeholder, link to legacy extension for
      visual reference
- [ ] T037 [P] [POLISH] Update root `README.md` "What's deferred"
      section to remove the overlay and add a link to
      `packages/api-spy-overlay-react/README.md`
- [ ] T038 [POLISH] Run all tests across all packages and capture
      `specs/003-overlay/test-transcript.md`

**Checkpoint**: 003-overlay release-ready. ~75 tests across SDK +
overlay + demo.

---

## Out of Scope (deferred to later specs)

These are explicitly NOT in 003's task list:

- **Server-side filters** (`db.*` globs, throttle by duration) → `004-overlay-filters`
- **Pause / resume semantics** → `005-overlay-pause`
- **Cross-origin / CORS** for the debugger endpoint and WS → `006-overlay-cors`
- **Auth tokens** for production → `007-overlay-auth`
- **Vue / Svelte / Solid framework wrappers** → re-use
  `computeGanttLayout.js` + `apiSpyClient.js` when needed
- **Touch events** for the glyph drag → `008-overlay-touch`
- **Chrome DevTools extension** (MV3 rewrite) → `002-extension-mv3`
- **Persistence of captured requests across page reloads** (overlay is in-memory only)