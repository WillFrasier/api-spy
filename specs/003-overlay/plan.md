# Implementation Plan: In-page debug overlay (003-overlay)

**Branch**: `003-overlay` | **Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-overlay/spec.md`

## Summary

Phase 3 ships a two-piece live-debug experience: a WebSocket handler in
the SDK that broadcasts each `track()` completion to subscribed clients,
and a React component library (`api-spy-overlay-react`) that renders a
draggable glyph + Gantt panel inside the host page. The Gantt fills in
**as queries complete**, not after the response returns — that's the
core value. Server-side filters, pause semantics, cross-origin auth,
and framework wrappers other than React are explicitly out of scope.

## Technical Context

**Language/Version**:
- SDK: Node ≥ 18 LTS, ESM (matches Phase 1).
- Overlay: React ≥ 18, ESM, no transpilation step (the consumer's bundler
  handles JSX/CSS).

**Primary Dependencies**:
- SDK: zero runtime deps (matches Phase 1). The `wsHandler()` opt-in
  dynamically imports `ws` (peer dep) so users who don't want WS don't
  pay the dep cost.
- Overlay: zero runtime deps beyond React 18+. The CSS file is plain CSS
  imported via the package.
- Demo app: existing deps from Phase 1, plus `ws` (peerDep in
  `api-spy`, hoisted to `demo-app`'s `node_modules` via npm).

**Storage**: in-process; subscriber set lives in the SDK's WS handler
module. No persistence across server restarts.

**Testing**:
- SDK: `node:test` + `assert/strict` + `supertest`. WS tests use the
  real `ws` client against a `ws` server mounted on a supertest app.
- Overlay: React Testing Library + jsdom + `node:test` runner. The
  `computeGanttLayout` math is tested in isolation (no DOM).

**Target Platform**: Linux/macOS developer laptops, Node 18+. The
overlay targets Chromium-based browsers (Chrome, Edge, Brave, Arc) and
Firefox. Mobile/touch is out of scope.

**Project Type**: monorepo with two more packages added to Phase 1's
structure:
- `packages/api-spy` (the SDK — modified: add `onQuery` hook + `wsHandler()`).
- `packages/api-spy-overlay-react` (the React component library — new).
- `examples/demo-app` (modified: mount the WS handler).

**Performance Goals**:
- `track()` overhead increase with `onQuery` set: ≤ 5µs (a single function call + a `Set.add`).
- WS broadcast fan-out to 10 subscribers: ≤ 1ms per query.
- React overlay render on incoming `query` event: ≤ 16ms (60fps budget).
- Glyph drag: 60fps mousemove (no React state churn during drag — use refs).

**Constraints**:
- Zero new runtime deps in the SDK core. `ws` is a peer dep, opt-in.
- The overlay is **client-only** (`'use client'`-equivalent): no server components.
- The Gantt layout math must be a framework-free pure function so future
  Vue/Svelte wrappers can re-use it without modification.
- Same-origin only. No CORS work in 003.
- PC only. Mouse events, no touch.

**Scale/Scope**:
- SDK addition: ≤ 200 LOC (handler + hook + tests).
- Overlay package: ≤ 600 LOC excluding tests.
- Demo app addition: ≤ 50 LOC (mount the WS handler).
- New tests: ~25 across SDK + overlay.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Library-First | ✅ | New package `api-spy-overlay-react` is a separate npm package with explicit `main`/`exports`. SDK addition is opt-in via `wsHandler()` factory. |
| II. Minimal-Footprint | ✅ | Zero new core SDK deps. `ws` is peer + dynamic-imported. Overlay has zero non-React deps. The glyph does not poll, does not register global handlers beyond its own DOM. |
| III. Contracts Over Coupling | ✅ | WS message schema defined in `contracts/ws-messages.schema.json`. The Gantt layout function is a pure function with no React import. The overlay package depends on the SDK only via HTTP (the debugger endpoint) + WS — no JS imports across the boundary. |
| IV. Test-First | ✅ | Every FR has a test mapping in `tasks.md`. `computeGanttLayout` and the WS handler are tested before any implementation. |
| V. Observability & Debuggability | ✅ | WS errors log with `[api-spy]` prefix; overlay shows stream interruptions visibly. |

No constitution violations. No "Complexity Tracking" section needed.

## Project Structure

### Documentation (this feature)

```text
specs/003-overlay/
├── plan.md                                # this file
├── research.md                            # Phase 0: WS vs SSE, drag, Gantt math port
├── data-model.md                          # WS message types + Gantt layout schema
├── quickstart.md                          # Mount the overlay in 3 lines
├── contracts/
│   └── ws-messages.schema.json            # JSON schema for every WS frame
├── analyze-report.md                      # Spec coverage analysis
└── tasks.md                               # TDD-ordered task list
```

### Source Code (repository root)

```text
packages/
├── api-spy/                                # modified in 003
│   ├── package.json                        # add `ws` as optional peer dependency
│   ├── src/
│   │   ├── index.js                        # re-export wsHandler + onQuery setter
│   │   ├── track.js                        # +invoke onQuery hook on finalize
│   │   ├── context.js                      # +expose ctx.finalize hook
│   │   └── wsHandler.js                    # NEW: Express handler, ws server, broadcaster
│   └── tests/
│       ├── unit/
│       │   ├── onQuery.test.js             # FR-001: hook fires on each query
│       │   └── ...
│       └── integration/
│           ├── wsHandler.test.js           # FR-002..FR-007: upgrade, broadcast, ping/pong
│           └── ...
│
└── api-spy-overlay-react/                  # NEW package
    ├── package.json                        # peer: react>=18; export: ./{index.js,styles.css}
    ├── src/
    │   ├── index.js                        # exports: <ApiSpyOverlay>, computeGanttLayout, hooks
    │   ├── ApiSpyOverlay.jsx               # top-level component
    │   ├── Gliph.jsx                       # floating button + drag
    │   ├── Panel.jsx                       # the open panel
    │   ├── GanttChart.jsx                  # renders from computeGanttLayout
    │   ├── hooks/
    │   │   ├── useApiSpyWebSocket.js       # connect + reconnect
    │   │   ├── useRequestCapture.js        # fetch + XHR hijack
    │   │   └── useDraggable.js             # mouse drag, viewport clamp, localStorage
    │   ├── lib/
    │   │   ├── computeGanttLayout.js      # PURE FUNCTION — ported from legacy panel.js
    │   │   └── apiSpyClient.js             # fetch /apiDebugger/:id
    │   └── styles.css                      # plain CSS, auto-imported
    └── tests/
        ├── unit/
        │   ├── computeGanttLayout.test.js # pure-function tests, no DOM
        │   ├── useDraggable.test.js       # jsdom + simulated mouse events
        │   └── useRequestCapture.test.js  # jsdom + hijack + teardown
        └── component/
            ├── Gliph.test.jsx
            ├── Panel.test.jsx
            ├── GanttChart.test.jsx
            └── ApiSpyOverlay.test.jsx     # full integration via RTL

examples/
└── demo-app/                               # modified in 003
    ├── src/
    │   ├── server.js                       # +mount apiSpy.wsHandler() at /api/v1/apiSpyControl
    │   └── routes/
    │       └── users.js                    # unchanged (already instruments 3 calls)
    └── tests/
        └── wsHandler.test.js               # FR-017/FR-018: full WS loop via supertest+ws
```

**Structure Decision**: a new top-level package for the overlay (not a
sub-export of `api-spy`). Rationale:
- Different peer deps (`react` vs zero-deps).
- Different bundler expectations (the overlay ships JSX + CSS; the SDK ships pure ESM).
- Different release cadence (the overlay can iterate independently).
- The boundary `computeGanttLayout.js` (pure function) is the seam future
  framework wrappers will share.

## Phase Plan

### Phase 0: Research (delivered in `research.md`)

1. **WebSocket vs SSE**: confirm `ws` + dynamic import is the right
   shape for an opt-in handler. (You already approved this.)
2. **Drag implementation**: native `mousedown` / `mousemove` / `mouseup`
   vs `pointer events`. Decision: native mouse events. PC only.
3. **Gantt layout math port**: extract from
   `legacy/extension/api-spy-extension/public/scripts/panel.js` lines
   178–233 into a pure function `computeGanttLayout(queries, totalDurationMs)`.
4. **WebSocket client reconnection**: use a backoff schedule starting at
   500ms, doubling to 30s. Reset on success.
5. **`fetch` + `XHR` hijack**: confirm teardown on unmount restores the
   originals. Use a flag to prevent re-entry if the user calls
   `mountApiSpyOverlay` twice.
6. **CSS scoping**: confirm plain CSS imported via the package works
   without a bundler-specific config. (It does — Vite, Next.js, and
   webpack all pick up `import './styles.css'` style imports from
   package.json `exports` map.)

### Phase 1: Design (delivered in `data-model.md`, `contracts/`)

1. **WS message types**: `query`, `request-complete`, `ping`, `pong`.
   Each with a JSON shape defined in `contracts/ws-messages.schema.json`.
2. **Gantt layout schema**: input is the same `Query[]` from the debugger
   endpoint; output is `{ name, startPercent, widthPercent, status,
   color }[]` — framework-agnostic.
3. **Quickstart**: 3-line integration in a React app, plus a `ws://`
   `curl` line for inspecting the demo manually.

### Phase 2: Tasks (delivered in `tasks.md`)

TDD-ordered tasks grouped by user story. Each implementation task is
preceded by a failing test task. See `tasks.md`.

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| WebSocket connection drops during a long request, leaving the overlay out of sync | Medium | The overlay offers to fetch the final state from `/apiDebugger/:id` on click. The `request-complete` message is the fallback boundary. |
| Two React trees mount `<ApiSpyOverlay>` (e.g., microfrontend) and both hijack `fetch` | Low | `useRequestCapture` checks a global "already installed" flag and refuses to install twice. Throws a helpful error. |
| The Gantt math produces incorrect percentages when queries overlap the request's overall timeline | Medium | `computeGanttLayout.test.js` covers: queries that start before `totalStart`, queries longer than `totalDuration`, queries with `durationInMilliseconds: 0` (round to 1%). |
| WS upgrade behind a corporate proxy that drops WebSocket frames | Low | The overlay falls back to polling `/apiDebugger/:id` every 2s when WS is unavailable. Spec'd separately as a follow-on — not in 003. |
| The legacy Gantt math uses jQuery's DOM construction; the port has to be DOM-free | High | The port is a pure function that returns an array of `{ startPercent, widthPercent, ... }`. The React component owns all DOM construction. The function has zero React imports. |
| `ws` install size adds 200KB to the demo app | Low | Acceptable for dev tooling. The SDK core does not gain a dep — `wsHandler()` is the opt-in boundary. |

## Complexity Tracking

> No constitution violations. Section intentionally empty.