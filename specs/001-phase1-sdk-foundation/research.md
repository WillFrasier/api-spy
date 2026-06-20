# Phase 0 Research: Phase 1 SDK Foundation

**Feature**: 001-phase1-sdk-foundation
**Date**: 2026-06-19

This document records the technical decisions made before design and
implementation began. Each section identifies the decision, the
alternatives considered, the chosen approach, and the rationale.

---

## R1. Async-local context mechanism

**Decision**: Use `node:async_hooks.AsyncLocalStorage` exclusively.

**Alternatives considered**:
- `continuation-local-storage` — abandoned; uses a hack on Node's old
  async hooks and breaks on modern Node.
- `request-local-storage` — abandoned; same family of problems; also
  pulls in CLS internally.
- Manual context object threaded through every function — violates
  Constitution Principle II (Minimal-Footprint Instrumentation).

**Rationale**: `AsyncLocalStorage` is the supported, stable, zero-dep
mechanism in modern Node. It correctly preserves context across
`setTimeout`, `Promise.then`, microtasks, and Express middleware chains
out of the box.

**Validation**: Add an integration test that exercises
`setTimeout`, `queueMicrotask`, and a nested `await` chain to prove
context is preserved in each case.

---

## R2. LRU eviction for the in-memory store

**Decision**: In-tree LRU using a `Map` insertion-order trick (re-insert
on access to bump to most-recent).

**Alternatives considered**:
- `lru-cache` npm package — 12 KB, well-maintained, but adds a runtime
  dep that violates FR-011.
- Bounded `Map` without LRU — violates the eviction requirement
  (edge case: "1000 retained requests").

**Rationale**: A correct LRU is ~30 lines. Adding a dep for that is
not justified. The implementation re-inserts a key on `get` to move it
to the most-recent end, then on `save` after the size check evicts the
oldest key (`map.keys().next().value`).

**Validation**: Unit test asserts eviction order under capacity pressure
and that `get(id)` returns `undefined` for an evicted id.

---

## R3. Express middleware ordering

**Decision**: Document that `apiSpy.express()` MUST be mounted before
any route that calls `apiSpy.track()`, but it is safe to mount AFTER
body parsers.

**Alternatives considered**:
- Auto-install on `require('express')` — rejected; violates Principle II
  (no monkey-patching).
- Provide a "router wrapper" instead of middleware — adds a different
  mental model; rejected for consistency with the rest of the Node
  ecosystem.

**Rationale**: Express middleware order is well understood. We make the
middleware an explicit, opt-in call.

**Validation**: The demo app installs the middleware first; an
integration test asserts that route handlers see the request id.

---

## R4. JSON schema validation in the contract test

**Decision**: Use `ajv` (2020 schema) as a **dev** dependency only,
scoped to the contract test.

**Alternatives considered**:
- Hand-rolled validator — works for a simple schema but is brittle and
  doesn't give standard error messages.
- `jsonschema` — also reasonable; `ajv` is faster and more widely used.

**Rationale**: The contract is small. `ajv` adds no runtime cost to
the SDK and is the de-facto validator in the Node ecosystem.

**Validation**: The contract test loads
`contracts/api-debugger-response.schema.json` and asserts the demo's
live response validates.

---

## R5. UUID generation

**Decision**: Use `crypto.randomUUID()` (Web Crypto, available in Node
14.17+).

**Alternatives considered**:
- `uuid` npm package — rejected; adds a dep for a built-in.
- Custom UUID v4 — pointless reinvention.

**Rationale**: Zero deps, native, RFC 4122 v4 compliant.

**Validation**: Assert that every request id matches
`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`.

---

## R6. Monorepo tooling

**Decision**: Two standalone npm packages with a parent README pointing
between them. No workspaces, no Turborepo, no Nx.

**Alternatives considered**:
- npm workspaces — slight win for `npm install` once, but adds
  friction when publishing the SDK.
- Single package with `examples/` directory inside — simpler, but the
  spec wants the SDK to be installable on its own.

**Rationale**: Phase 1 is two packages. The ergonomic gain of workspaces
doesn't justify the cognitive overhead of `workspaces` config until we
have three or more packages or shared code.

**Validation**: `cd packages/api-spy && npm install && npm test` works
without the parent present. `cd examples/demo-app && npm install` works
without installing the SDK globally — the demo depends on `api-spy`
via `file:../../packages/api-spy`.

---

## R7. Handling of legacy code

**Decision**: Move `server/`, `extension/`, `test-project/` into a
new top-level `legacy/` directory at the START of implementation,
before adding any new package. Add a `legacy/README.md` explaining the
move.

**Alternatives considered**:
- Delete in place — irreversible; the existing extension UI work is
  worth preserving as reference for Phase 2.
- Leave where they are — risk of name collision with new
  `packages/api-spy/src/server.js` style files.

**Rationale**: Git keeps history; the files are cheap to move.

**Validation**: `git log --follow` shows the move; the legacy README
points at the new location.

---

## Open Questions

None. Every open question raised during planning was resolved above.
