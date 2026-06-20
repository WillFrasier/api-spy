# Phase 0 Research: In-page debug overlay (003-overlay)

**Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Decision Log

### D1. WebSocket vs SSE

**Decision**: WebSocket via the `ws` package, dynamically imported.

**Why**:
- You asked for bidirectional comms so the overlay can send commands
  to the server later (filters, pause). WebSocket is the natural fit.
- SSE is one-way only; "upgrading" to bidirectional would mean a parallel
  POST endpoint, which is awkward.
- `ws` is the canonical Node WebSocket library, ~200KB, zero deps,
  widely deployed.

**Trade-off**:
- WebSocket gets proxied/blocked by some corporate firewalls. SSE
  doesn't. We're OK with this — dev tooling on a developer laptop is
  the target environment. Production proxies in customer environments
  vary; we'll cross that bridge in a later spec.

**Alternative considered**: SSE with a parallel POST command endpoint.
Rejected because the two-stream architecture is harder to reason about
than one bidirectional stream.

---

### D2. `ws` as a peer dependency, dynamically imported

**Decision**: `ws` is an **optional peer dependency** of the SDK. It's
loaded via `await import('ws')` inside `wsHandler()`, so the core SDK
stays zero-dep.

**Why**:
- The SDK's headline is zero runtime deps (Phase 1, Principle II). A
  hard dep on `ws` would violate that for users who don't use the
  WebSocket feature.
- The `wsHandler()` factory is the opt-in boundary. Users who don't
  call it never import `ws`.

**Trade-off**:
- A user who installs `api-spy` without `ws` and then calls
  `apiSpy.wsHandler()` gets a runtime error. The error message tells
  them how to fix it (`npm install ws`).

---

### D3. Drag implementation: native mouse events

**Decision**: `mousedown` / `mousemove` / `mouseup` on the glyph root,
no `pointer events`, no drag library.

**Why**:
- The glyph is a single DOM element with a single draggable behavior.
  A library would be more code than the implementation.
- Pointer events would be the "correct" modern choice, but they're not
  supported on all targets we care about (older Safari, embedded
  browsers). Mouse events work everywhere.
- During drag, we update `style.left` / `style.top` directly via refs
  — no React state, no re-renders, 60fps.

**Trade-off**:
- Touch events are not supported. Out of scope (you said PC only).

---

### D4. Gantt math port: pure function, zero DOM

**Decision**: Port `legacy/extension/api-spy-extension/public/scripts/panel.js`
lines 178–233 into a pure function
`computeGanttLayout(queries, totalDurationMs) -> LayoutRow[]` that
takes the input queries and returns layout coordinates as plain JSON.
The React component owns all DOM construction.

**Why**:
- The legacy code computes percentage positions for each query, then
  appends `<div>` elements with inline styles. The math is
  framework-agnostic; only the DOM construction is jQuery-coupled.
- Splitting math from rendering makes the math testable without a DOM,
  and reusable for future framework wrappers.
- `totalDurationMs` is the request's total wall-clock duration
  (`timing.durationInMilliseconds` from the debugger response). The
  math divides the timeline into a percentage grid; each query gets
  a `startPercent` and `widthPercent`.

**Trade-off**:
- The function needs to be told the total duration. We get it from the
  request's `startTime` (oldest query start) to `endTime` (newest query
  end) as a fallback if the request total isn't available yet (mid-request).

---

### D5. WebSocket reconnection: exponential backoff

**Decision**: On `close`, reconnect with delay = `min(500ms * 2^attempts, 30s)`.
Reset the backoff on first successful message.

**Why**:
- Server restarts are common in dev. The overlay should recover without
  user action.
- A linear retry would hammer the server during a multi-second restart.
  Exponential backoff is the standard answer.

**Trade-off**:
- A user mid-request who loses the WS connection will see stale state.
  The fallback to `/apiDebugger/:id` on click covers this.

---

### D6. Fetch/XHR hijack teardown

**Decision**: `useRequestCapture` installs wrappers on mount and
uninstalls them on unmount. A module-level flag prevents double-install
if two overlays are mounted (throws a helpful error).

**Why**:
- Without teardown, every hot-reload in dev would chain another wrapper.
  After 100 hot-reloads, every fetch would be 100x slower.
- Two overlays mounted simultaneously would both try to capture
  requests, double-counting. The flag catches this early.

**Trade-off**:
- A microfrontend with two separate React roots that both want the
  overlay has to coordinate. The error message tells them which one
  is the duplicate.

---

### D7. CSS scoping: plain CSS, no CSS-in-JS, no modules

**Decision**: Ship a single `styles.css` file. Import it via the package's
`exports` map (`"./styles.css": "./src/styles.css"`). The consumer
imports it explicitly: `import 'api-spy-overlay-react/styles.css'`.

**Why**:
- Plain CSS is the lowest-dependency, highest-compatibility option.
  It works with Vite, Next.js, webpack, esbuild, Parcel — every
  bundler.
- CSS-in-JS (`styled-components`, `emotion`) adds runtime + a peer dep.
  Not worth it for a dev tool.
- CSS Modules would force the consumer to configure their bundler.
  Painful.

**Trade-off**:
- The overlay's class names must be unique to avoid collisions
  (`api-spy-overlay-*`). The risk is low because the names are
  namespaced by a top-level class on the root element.

---

### D8. WS message shape: matches the debugger endpoint query shape

**Decision**: The `query` WS message carries the same JSON shape as
`api-debugger-response.schema.json`'s `Query` object, verbatim. The
overlay uses the same renderer for streamed queries and fetched-from-debugger
queries.

**Why**:
- One code path in the React component: render an array of `Query`
  objects. The array may be filled by WS events, by a fetch fallback,
  or both.
- Contract re-use: the WS schema validates that the message matches
  the debugger schema. If they drift, the contract test catches it.

---

## Open Questions Resolved

1. **Q: Heartbeat cadence?**
   **A:** 30s default. The overlay sends `ping` every 25s, expects
   `pong` within 5s, otherwise closes and reconnects.

2. **Q: Multi-process broadcasting?**
   **A:** Out of scope. Single-process only. Multi-process would
   need Redis pubsub; spec'd separately.

3. **Q: WS path collision?**
   **A:** Default path `/api/v1/apiSpyControl`. If the host already
   uses it, the user can pass a different path: `apiSpy.wsHandler({ path: '/__my_custom_path__' })`.
   No collision check; the user is responsible.

---

## References

- `legacy/extension/api-spy-extension/public/scripts/panel.js` lines
  178–233 — the Gantt math we're porting.
- `legacy/extension/api-spy-extension/public/panel.html` — the visual
  reference for the Gantt styling (colors, dimensions).
- `specs/001-phase1-sdk-foundation/contracts/api-debugger-response.schema.json`
  — the `Query` shape the WS messages must match.
- `ws` package documentation — https://github.com/websockets/ws.
- `EventSource` (MDN) — alternative considered but rejected.