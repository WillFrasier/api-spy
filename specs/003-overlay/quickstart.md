# Quickstart: In-page debug overlay (003-overlay)

**Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)

5 minutes from `npm install` to seeing a live Gantt chart fill in as
your server-side calls complete.

## 1. Install

```bash
# Core SDK (Phase 1)
npm install api-spy
# WebSocket handler dependency (opt-in)
npm install ws
# React overlay (Phase 3)
npm install api-spy-overlay-react
```

## 2. Server: mount the WS handler

```js
import express from 'express'
import * as apiSpy from 'api-spy'

const app = express()
app.use(apiSpy.expressMiddleware())           // opens request contexts (Phase 1)
app.use('/api/v1/apiSpyControl', apiSpy.wsHandler())  // NEW in 003: WS broadcaster
// ... your instrumented routes ...
```

That's the entire server change. The `wsHandler()` is opt-in and
requires `ws` to be installed.

## 3. React app: mount the overlay

```jsx
import { ApiSpyOverlay } from 'api-spy-overlay-react'
import 'api-spy-overlay-react/styles.css'

export function App() {
  return (
    <>
      <YourStuff />
      {process.env.NODE_ENV !== 'production' && (
        <ApiSpyOverlay position="bottom-right" />
      )}
    </>
  )
}
```

## 4. Make a request and watch

```text
1. Open your app in a browser.
2. The api-spy glyph appears in the bottom-right corner.
3. Make any HTTP request to an instrumented route.
4. Click the glyph → your request is listed.
5. Click the request → the Gantt fills in bar-by-bar as the
   server-side calls complete.
```

## 5. Drag, persist, reload

```text
- Drag the glyph to a new corner.
- Reload the page.
- The glyph appears at the new position (persisted via localStorage).
```

## What's happening on the wire

```text
browser                              server
  │                                    │
  │  fetch('/api/v1/users/42')         │
  │ ────────────────────────────────►  │
  │                                    │  ← expressMiddleware opens context
  │                                    │  ← track('db.find')  emits 'query' over WS
  │                                    │  ← track('http.fetch') emits 'query' over WS
  │  ◄── event: query {name: db.find} │
  │  ◄── event: query {name: http.fetch} │
  │                                    │  ← track('llm.summarize') emits 'query' over WS
  │  ◄── event: query {name: llm.summarize} │
  │  ◄── event: request-complete {status: ok, 207ms} │
  │                                    │
  │  ◄── HTTP 200 + X-ApiSpy-RequestId│
  │                                    │
```

## What's deferred

This quickstart covers the minimum viable flow. Out of scope for 003:

- Server-side filters (`db.*` globs, throttle by duration)
- Pause / resume semantics
- Cross-origin (CORS)
- Auth tokens
- Vue / Svelte / Solid framework wrappers
- Touch events for the glyph drag
- Chrome DevTools extension (separate spec)