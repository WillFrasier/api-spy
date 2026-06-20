# Data Model: Phase 1 SDK Foundation

**Feature**: 001-phase1-sdk-foundation
**Date**: 2026-06-19

This document defines the runtime data shapes used by the SDK and
exchanged over HTTP. Shapes are described in JSDoc-style notation so
they can be shared between TypeScript-aware and JavaScript-only code.

---

## Core Types

### Request

A top-level unit of work opened by `apiSpy.run()`. Created when `run()`
begins and finalized when the callback settles (resolve, reject, or the
process is about to exit).

```js
/**
 * @typedef {Object} Request
 * @property {string} id                          UUID v4
 * @property {string} startTime                   ISO 8601 with millis, e.g. "2026-06-19T19:30:00.123Z"
 * @property {string|null} endTime                ISO 8601 or null if not finished
 * @property {number} durationInMilliseconds      integer >= 0; 0 if not finished
 * @property {('ok'|'error'|'incomplete')} status
 * @property {ApiSpyError|null} error            populated iff status === 'error'
 * @property {Query[]} queries                    children in start-time order
 */
```

### Query

A child operation recorded by `apiSpy.track()`.

```js
/**
 * @typedef {Object} Query
 * @property {string} id                          UUID v4
 * @property {string} name                        user-supplied, e.g. "db.users.findById"
 * @property {string|null} parentQueryId          id of the enclosing query, or null
 * @property {string} startTime                   ISO 8601
 * @property {string|null} endTime                ISO 8601 or null if not finished
 * @property {number} durationInMilliseconds      integer >= 0
 * @property {('ok'|'error'|'incomplete')} status
 * @property {ApiSpyError|null} error
 * @property {Record<string, unknown>|null} metadata  optional user-supplied via opts.metadata
 */
```

### ApiSpyError

A serializable projection of a thrown error.

```js
/**
 * @typedef {Object} ApiSpyError
 * @property {string} name                        e.g. "TypeError"
 * @property {string} message
 * @property {string} stack                       stack trace at capture time
 */
```

### Store

The storage adapter interface. Two implementations in Phase 1: an
in-memory LRU (default) and a contract-test fake.

```js
/**
 * @typedef {Object} Store
 * @property {(record: Request) => void} save
 * @property {(id: string) => (Request|undefined)} get
 * @property {() => void} [dispose]              optional cleanup hook
 */
```

---

## Lifecycle

```
apiSpy.run(fn)
   |
   |--> generate id = crypto.randomUUID()
   |--> startTime = now
   |--> queries = []
   |--> AsyncLocalStorage.run({ request }, async () => fn())
   |       |
   |       |--> apiSpy.track('a', inner)        # inside ALS scope
   |       |       record Query { parentQueryId: null }
   |       |--> apiSpy.track('b', inner2)       # nested
   |       |       record Query { parentQueryId: 'a' }
   |       |
   |--> on settle:
   |       status = ok | error
   |       endTime = now
   |       duration = now - startTime
   |--> store.save(request)
```

Errors and rejections do NOT prevent `save()` from being called. The
record reflects the failure state and the original error still
propagates to the caller of `run()`.

---

## Serialization Rules

- `JSON.stringify(record)` MUST round-trip without loss.
- `error.stack` is a string, kept verbatim. (No scrubbing in Phase 1.)
- Empty `queries` is `[]`, never `null`.
- `parentQueryId` is `null` (JSON), not `undefined`.
- Timestamps are ISO 8601 strings, never numbers.
- The `metadata` field is preserved as opaque JSON; the SDK does not
  validate its shape.

---

## Identity & Correlation

- A `Request.id` is the canonical correlation key.
- The same id is:
  - available inside code via `apiSpy.getRequestId()`
  - exposed to the browser via the `X-ApiSpy-RequestId` response header
  - used as the path parameter of the debugger endpoint
  - included in every `[api-spy]` log line as `requestId=<id>`
- A `Query.id` is generated only for trace navigation within the
  request tree; it is NOT propagated externally in Phase 1.

---

## Capacity & Eviction

- Default `InMemoryStore` capacity: **1000** records.
- On `save()` when full, the oldest record (by insertion order) is
  evicted before the new one is inserted.
- Eviction is logged at `info` level: `[api-spy] evicted requestId=<id>`.
- A `get()` for an evicted id returns `undefined`, which the debugger
  endpoint translates to `404`.

---

## API Surface (the public exports of the SDK)

```js
// packages/api-spy/src/index.js
export {
  run,                  // (fn: () => T | Promise<T>) => Promise<T>
  track,                // (name: string, fn: () => T | Promise<T>, opts?: { metadata?: object }) => Promise<T>
  getRequestId,         // () => string | null
  init,                 // ({ store?: Store }?) => void
  express,              // () => express.RequestHandler
  // Internal types are NOT exported; consumers use the HTTP contract.
}
```

Names are exported as named exports. There is no default export.
