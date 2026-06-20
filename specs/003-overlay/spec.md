# Feature Specification: In-page debug overlay

**Feature Branch**: `003-overlay`
**Created**: 2026-06-20
**Status**: Draft
**Input**: User description: "Phase 3: a small floating glyph overlay in the dev's web page that, when clicked, shows the live Gantt chart of an instrumented request — driven by a WebSocket from the SDK to push query events as they complete."

## Context

Phase 1 shipped a Node SDK that records every instrumented call into an
in-memory LRU store and exposes it at `GET /api/v1/apiDebugger/:id` as a
flat JSON tree. Phase 1 has no live UI — you `curl` the endpoint and read
JSON. The legacy Chrome extension (`legacy/extension/`) shows a Gantt
chart but runs in DevTools (separate process), uses jQuery + Moment.js
(290 KB combined), and doesn't speak the new wire contract. It also
needs an install step, which most developers don't want for a dev tool.

Phase 3 ships an in-page overlay:

- A React component library, `api-spy-overlay-react`, that renders a
  small draggable glyph anchored to a corner of the host app.
- A WebSocket handler in the SDK, `apiSpy.wsHandler()`, that pushes
  each `track()` query as it completes.
- The React component opens the WebSocket, fills the Gantt chart as
  events arrive, and lets the developer click any in-flight request to
  see its full call tree.

The Gantt layout math is the **only** piece of legacy code we lift —
the percentage-positioning logic from
`legacy/extension/api-spy-extension/public/scripts/panel.js` lines
178–233. It is ported as a framework-free pure function so it can be
re-used by future framework wrappers (Vue, Svelte) without modification.

Scope is deliberately minimal:

- **In:** WS handler in SDK, glyph + Gantt panel in React, demo app
  wiring, one bidirectional ping/pong keepalive.
- **Out:** server-side filtering, pause semantics, auth tokens,
  framework wrappers other than React, Chrome DevTools extension
  (separate spec `002-extension-mv3`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See a request glyph appear (Priority: P1)

As a developer using an api-spy-instrumented app, I want a small
glyph to appear in the corner of my page the moment my app makes a
request, so I know the debugger is watching.

**Why this priority:** Without this, the overlay is invisible. It's
the affordance that surfaces the rest of the experience.

**Independent test:** Mount the overlay in a host page. Make any
HTTP request to a route that returns `X-ApiSpy-RequestId`. Assert the
glyph badge increments by 1 within 100ms of the response landing.

**Acceptance scenarios:**

1. **Given** a host page with the overlay mounted, **when** I `fetch('/api/anything')` against an instrumented route, **then** the overlay's request count increments within 100ms of the response.
2. **Given** a host page with the overlay mounted, **when** I make a non-instrumented request (no `X-ApiSpy-RequestId` header), **then** the overlay shows no change.
3. **Given** a host page with the overlay mounted and 50 requests in the badge, **when** a 51st lands, **then** the oldest is dropped (FIFO cap, default 50).

---

### User Story 2 - Open the Gantt panel for an in-flight request (Priority: P1)

As a developer, I want to click a recent request in the overlay and see
its call graph fill in **as the server completes each query**, so I can
see where time is being spent without waiting for the request to finish.

**Why this priority:** This is the core value — live progress, not
history. It's what differentiates an in-page overlay from `curl + jq`.

**Independent test:** Make a request that takes ~500ms. Open the
overlay immediately (within 50ms). Observe that each `track()` call
becomes visible on the Gantt chart as it completes, before the response
returns to the client.

**Acceptance scenarios:**

1. **Given** an instrumented request in flight, **when** I open the overlay panel before the response returns, **then** I see at least one Gantt bar for the request, and bars appear one-by-one as each `track()` completes.
2. **Given** the overlay is open and the request has 3 instrumented calls, **when** all 3 complete, **then** the Gantt chart shows exactly 3 bars with non-zero durations and correct relative positions.
3. **Given** a completed request with cached query results, **when** I open it, **then** the Gantt renders from the buffered events without re-fetching (the WS replay covers the in-flight period, not the final state).

---

### User Story 3 - Drag the glyph to reposition it (Priority: P2)

As a developer, I want to drag the glyph to a different corner so it
doesn't cover my UI, and have it stay where I put it across reloads.

**Why this priority:** Convenience. Without it the glyph is anchored
and developers will complain about it covering critical UI.

**Independent test:** Mount the overlay. Drag the glyph from
bottom-right to top-left. Reload the page. Assert the glyph appears at
top-left on the second mount.

**Acceptance scenarios:**

1. **Given** the overlay is mounted at its default position (bottom-right), **when** I mousedown + mousemove + mouseup on the glyph, **then** the glyph ends at the drop position.
2. **Given** the user dragged the glyph to a new position, **when** the page is reloaded, **then** the glyph appears at the new position (persisted via `localStorage`).
3. **Given** the overlay is mounted, **when** I drag the glyph off-screen (e.g. position > viewport), **then** the position is clamped to the viewport bounds.

---

### User Story 4 - See the captured record in the wire shape (Priority: P2)

As a developer, when a request finishes I want the overlay to fetch the
full recorded tree from `GET /api/v1/apiDebugger/:id` so I can see
metadata I missed during the live stream (status, error, query
metadata).

**Why this priority:** The WS stream is best-effort and may miss events
during reconnects. The debugger endpoint is the source of truth.

**Independent test:** Make an instrumented request. After it completes,
open the overlay. Assert the panel shows the full query tree with
metadata from the debugger endpoint, not just the streamed events.

**Acceptance scenarios:**

1. **Given** a completed request, **when** I click it in the overlay, **then** the panel fetches `/api/v1/apiDebugger/:id` and renders the response (queries, timing, error).
2. **Given** the debugger endpoint returns an error (404, 400), **when** the panel receives it, **then** the UI shows "request not found / not available" without crashing.

---

### User Story 5 - Bidirectional keepalive works (Priority: P3)

As a developer, I want the WebSocket to stay alive across long-running
requests (multi-minute LLM calls, long DB queries) so the overlay
doesn't drop the stream mid-request.

**Why this priority:** Edge case. Most requests are under 30s and the
default WS timeout (60s) covers them. But long-running requests need
this.

**Independent test:** Open the overlay. Wait 2 minutes without
activity. Send a new request. Assert the overlay receives the events
without reconnecting.

**Acceptance scenarios:**

1. **Given** an open WS connection idle for 2 minutes, **when** a new request lands, **then** the overlay receives its events without dropping.
2. **Given** the WS disconnects (server restart, network blip), **when** a new request lands, **then** the overlay reconnects automatically with exponential backoff and resumes receiving events.

---

### Edge Cases

- **Server restart during request.** The stream ends mid-flight. The overlay marks the request as "stream interrupted" and offers to fetch the final state from `/apiDebugger/:id` on click.
- **Two requests with overlapping `track()` calls.** The WS message includes the `requestId` so the overlay routes each event to the right request card.
- **Express middleware not mounted.** The overlay's WS connection returns 404 / refuses to upgrade. The overlay shows "api-spy SDK not installed on this origin." No crash.
- **Host page has its own `X-ApiSpy-RequestId` request header.** The hijack reads the *response* header, not the request, so this is fine.

## Functional Requirements *(mandatory)*

### SDK (packages/api-spy)

- **FR-001** — `track()` invokes a registered `onQuery(ctx, query)` hook synchronously after each query finalizes (success or error). The hook is set via `init({ onQuery })`. If not set, `track()` is unchanged.
- **FR-002** — The SDK exports `apiSpy.wsHandler({ path? })` returning an Express-compatible handler that upgrades the connection to a WebSocket. Default path: `/api/v1/apiSpyControl`. The handler is registered with `app.wsHandler()` style — `app.use('/api/v1', apiSpy.wsHandler())` mounts the upgrade.
- **FR-003** — On `WebSocket` connect, the handler subscribes the connection to all future query events. On disconnect, the subscription is removed.
- **FR-004** — On receiving a `track()` completion, the handler broadcasts a `query` message to every subscribed connection. Message format: `{ type: 'query', requestId, query }` where `query` is the same shape as `api-debugger-response.schema.json`'s query object (no transform).
- **FR-005** — On receiving a `track()` completion that finishes the request (last query of the request), the handler broadcasts a `request-complete` message: `{ type: 'request-complete', requestId, status, durationInMilliseconds }`.
- **FR-006** — The handler accepts a `ping` message from any client and replies with `pong` (heartbeat, ≤ 30s interval). Used by the overlay's `useApiSpyWebSocket` to keep the connection alive across long idle periods.
- **FR-007** — The handler imports the `ws` package via `await import('ws')` (dynamic import) and throws a clear error if `ws` is not installed: `api-spy requires the 'ws' package to use wsHandler(); install with \`npm install ws\```. This keeps `ws` an optional peer dependency.

### Overlay (packages/api-spy-overlay-react)

- **FR-008** — Exports a single React component, `<ApiSpyOverlay position="bottom-right" maxRequests={50} />`. It renders the glyph and (when open) the panel.
- **FR-009** — On mount, opens a `WebSocket` to `${window.location.origin}/api/v1/apiSpyControl` (same-origin only). On `close`, reconnects with exponential backoff starting at 500ms, capping at 30s.
- **FR-010** — On every WS message, dispatches into an internal reducer: `query` events append to the matching request's query list; `request-complete` events mark the request as complete and stop listening for further events for that id.
- **FR-011** — The glyph displays the count of captured requests (last `maxRequests`). Clicking the glyph toggles the panel.
- **FR-012** — The glyph is draggable via mouse events (`mousedown` / `mousemove` / `mouseup`). Position is clamped to `[0, viewport - glyphSize]`. On `mouseup`, the position is persisted to `localStorage` under `api-spy-overlay:position`.
- **FR-013** — On mount, the overlay reads `localStorage['api-spy-overlay:position']` and applies it. If the saved position is off-screen (window resized), it falls back to the default position.
- **FR-014** — The panel renders a list of request cards. Each card shows: method + URL + duration + status (color-coded). Clicking a card fetches `/api/v1/apiDebugger/:id` and renders the Gantt.
- **FR-015** — The Gantt is rendered from `computeGanttLayout(queries, totalDurationMs)`. The function is exported from the package so future framework wrappers can re-use it. Tests cover: ordering, percentage calculation, sub-millisecond rounding, errored queries.
- **FR-016** — The overlay subscribes to `fetch` and `XMLHttpRequest` to capture request URLs as they fire (so the user sees the request name *before* the WS event lands). Hijack is uninstalled on unmount.

### Demo app (examples/demo-app)

- **FR-017** — `server.js` mounts `apiSpy.wsHandler()` alongside the existing debugger route. The demo's README quickstart adds one `curl` line that opens a `ws://` connection for manual inspection.
- **FR-018** — The demo's test suite adds tests covering: WS handler upgrade, message broadcast to multiple subscribers, disconnect cleanup, ping/pong round-trip.

## Success Criteria *(mandatory)*

- **SC-001** — Mounting the overlay in a host page produces zero React warnings or console errors.
- **SC-002** — A request that takes 500ms with 3 `track()` calls produces 3 Gantt bars visible in the overlay, in order, before the response returns to the client.
- **SC-003** — Dragging the glyph 100px in any direction updates its position; reloading the page preserves the new position.
- **SC-004** — 50 simultaneous instrumented requests produce 50 distinct request cards in the overlay, each with the correct queries.
- **SC-005** — The `wsHandler()` throws a helpful error if `ws` is not installed (verified by running without the dep).
- **SC-006** — A request's Gantt renders correctly from `computeGanttLayout` regardless of the underlying framework (covered by `computeGanttLayout.test.js`, which has zero React dependencies).

## Out of Scope

These are explicitly deferred to follow-on specs. Mentioning here so a
skeptical reviewer doesn't think we forgot them:

- **Server-side filters** (`db.*` globs, throttle by duration, etc.). Spec'd separately as `004-overlay-filters`.
- **Pause / resume** semantics. Spec'd separately as `005-overlay-pause`.
- **Cross-origin / CORS** for the debugger endpoint and WS. Spec'd separately.
- **Auth tokens** for production deployments. Spec'd separately.
- **Vue / Svelte / Solid** framework wrappers. Re-use `computeGanttLayout.js` + `apiSpyClient.js`; spec'd when there's a customer.
- **Touch events** for the glyph drag. Spec'd separately (you said PC only).
- **Chrome DevTools panel** (the old extension). Spec'd separately as `002-extension-mv3`.
- **Persistence of captured requests across page reloads.** The overlay is in-memory only, matching the SDK.

## Open Questions

1. **Heartbeat cadence.** I'm proposing 30s. Should it be configurable via `init({ ws: { heartbeatMs } })`?
2. **Multi-process broadcasting.** If the demo app eventually scales to multiple Node processes, the in-memory subscriber set won't fan out. Probably needs Redis pubsub for `track()` events. Spec'd separately.
3. **WS path collision.** If the host app already mounts `/api/v1/apiSpyControl` for something else, ours silently shadows it. Worth a check + clearer error?

## Notes for Implementer

- The `ws` package is imported dynamically (`await import('ws')`) so users who don't want WS don't pay the dep cost. The `wsHandler()` factory is the opt-in.
- The Gantt layout math is a pure function in `computeGanttLayout.js`. Test it independently of React. This is the boundary that lets future framework wrappers re-use the math.
- The WS message shape **must** match `api-debugger-response.schema.json`'s query object verbatim. The contract is shared with the debugger endpoint so a fetch-fallback renders the same shape.