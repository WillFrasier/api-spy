# Data Model: In-page debug overlay (003-overlay)

**Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)

This document defines the WebSocket message types and the Gantt layout
schema. The Query / Request shapes themselves are unchanged from
Phase 1 — they live in
`specs/001-phase1-sdk-foundation/data-model.md` and the WS contract
**must** reuse them verbatim.

## WS Message Types

Every WS frame is a JSON object with a discriminated `type` field.
The full JSON Schema is in `contracts/ws-messages.schema.json`.

### `query` — server → client

Pushed when a `track()` call completes. Shape:

```ts
type QueryMessage = {
  type: 'query'
  requestId: string          // UUID v4, matches the request's X-ApiSpy-RequestId
  query: Query                // verbatim from api-debugger-response.schema.json
}
```

The `query` field is the same shape as the debugger endpoint's
`queries[]` element. The overlay does no transformation.

### `request-complete` — server → client

Pushed when the request's context finalizes (response sent, error
caught, or context abandoned). Shape:

```ts
type RequestCompleteMessage = {
  type: 'request-complete'
  requestId: string
  status: 'ok' | 'error'
  durationInMilliseconds: number
}
```

The overlay uses this to mark a request card as "complete" and
disable further WS rendering for it. A subsequent click on the card
fetches `/apiDebugger/:id` for the final tree.

### `ping` — client → server

Keepalive. Shape:

```ts
type PingMessage = { type: 'ping'; t: number /* ms since epoch */ }
```

### `pong` — server → client

Keepalive reply. Shape:

```ts
type PongMessage = { type: 'pong'; t: number /* echoes ping t */ }
```

## Gantt Layout Schema

The Gantt layout math takes the same `Query[]` shape from the debugger
endpoint and returns layout coordinates as plain JSON. This is the
**framework-free seam** that future Vue/Svelte wrappers will share.

### Input

```ts
type ComputeGanttLayoutInput = {
  queries: Query[]                      // from the debugger endpoint or WS stream
  totalDurationMs?: number              // optional override; defaults to oldest→newest span
  totalStartTimeMs?: number             // optional; defaults to earliest query startTime
}
```

### Output

```ts
type GanttLayoutRow = {
  queryId: string                       // maps to input Query.id
  name: string
  startPercent: number                  // 0-100, relative to total timeline
  widthPercent: number                  // 0-100
  status: 'ok' | 'error'
  durationMs: number
}

type GanttLayout = {
  totalDurationMs: number
  totalStartTimeMs: number
  rows: GanttLayoutRow[]
}
```

### Algorithm

1. If `totalDurationMs` is not provided, compute it as
   `max(query.endTimeMs) - min(query.startTimeMs)` over all queries,
   with a floor of 1ms to avoid divide-by-zero.
2. If `totalStartTimeMs` is not provided, use
   `min(query.startTimeMs)`.
3. For each query:
   - `startPercent = ((query.startTimeMs - totalStartTimeMs) / totalDurationMs) * 100`
   - `widthPercent = (query.durationInMilliseconds / totalDurationMs) * 100`
   - Clamp `startPercent` to `[0, 100]`.
   - Clamp `widthPercent` to `[0.5, 100 - startPercent]` (so a bar
     never overflows the right edge; minimum 0.5% so sub-millisecond
     queries are visible).
   - Round both to one decimal place for display.

### Tests for the algorithm

`tests/unit/computeGanttLayout.test.js` covers:

- Empty `queries: []` returns `{ rows: [], totalDurationMs: 0, totalStartTimeMs: 0 }`.
- Single query that fills the entire timeline.
- Two parallel queries that don't overlap in time.
- Two queries that overlap in time.
- A query that starts before `totalStartTime` (negative `startPercent`) is clamped.
- A query with `durationInMilliseconds: 0` gets `widthPercent: 0.5`.
- An errored query is rendered in the error color (the function returns
  `status: 'error'`; the React component maps that to a CSS class).
- Result is deterministic for a given input (same input → same output).