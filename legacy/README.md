# Legacy code (pre-Phase 1)

This directory contains the original api-spy code from before the Phase 1
rewrite. It is preserved for historical reference only and is **not**
maintained, installed, or shipped.

## What's here

| Path | Original location | Status |
| --- | --- | --- |
| `legacy/server/` | `./server/` | Half-finished Node SDK sketches on abandoned deps (`continuation-local-storage`, `request-local-storage`, `uuid` v3). Two competing designs that don't agree with each other or with the extension. **Not used by the new SDK.** |
| `legacy/extension/` | `./extension/api-spy-extension/` | Chrome extension (MV2). Working DevTools panel with Gantt chart and per-query details. Header name mismatch (`apirequestid` vs `X-ApiSpy-RequestId`) and an outdated `webRequestBlocking` setup mean it doesn't work against the new SDK. |
| `legacy/test-project/` | `./test-project/` | Demo Express app that was the original integration target. Replaced by `examples/demo-app/` in Phase 1. |

## What replaced it

- **SDK**: `packages/api-spy/` — built on `node:async_hooks.AsyncLocalStorage`,
  zero runtime dependencies, ESM.
- **Demo app**: `examples/demo-app/` — modern Express app that exercises the
  full Phase 1 loop end-to-end.
- **Chrome extension**: deferred to a Phase 2 spec (`002-extension-mv3` or
  similar) which will rewrite the extension against the new SDK contract
  and migrate to Manifest V3.

## Why it wasn't deleted

The original extension UI work (Gantt chart rendering, request table,
details panel) is worth keeping as a visual reference for Phase 2. The
Node SDK sketches document what _not_ to do (and why we picked
`AsyncLocalStorage`). Git history is intact — use `git log --follow` on
any file to see its lineage.