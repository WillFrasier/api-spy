<!--
Sync Impact Report
- Version change: none → 1.0.0 (initial ratification)
- Modified principles: none (initial set)
- Added sections: Core Principles (5), Technology Constraints, Development Workflow, Governance
- Removed sections: none
- Templates requiring updates: ✅ plan-template.md (Constitution Check populated below)
- Follow-up TODOs: none
-->

# api-spy Constitution

## Core Principles

### I. Library-First
Every piece of api-spy ships as a standalone, independently versioned library or
package with a single, named responsibility. The Node SDK is one package; the
Chrome extension is one package; the demo server is one package. A package MUST
be self-contained, MUST be installable without the rest of the repo, and MUST
declare its public API surface explicitly. No "organizational-only" packages
that exist solely to share code between siblings — if two packages need the same
helper, that helper graduates into a third package.

### II. Minimal-Footprint Instrumentation
The instrumentation library MUST add as little overhead and surface area to a
user's application as possible. No global side effects at import time. No
monkey-patching of framework primitives (Express, Koa, Fastify, undici, etc.).
Users MUST be able to opt into tracking with explicit, local calls. The only
ambient behavior permitted is reading Node's `AsyncLocalStorage` to correlate
work that the user has already wrapped. Any change that adds startup latency,
adds a top-level `await`, or touches a global is a Constitution violation and
MUST be justified in the PR.

### III. Contracts Over Coupling (NON-NEGOTIABLE)
The SDK, the storage layer, and the Chrome extension communicate exclusively
through versioned, documented contracts. For Phase 1 the wire format is the
JSON shape returned by `GET /api/v1/apiDebugger/:id` and the header
`X-ApiSpy-RequestId`. Any change to a contract field name, type, or required-ness
MUST be accompanied by a contract-test update and a CHANGELOG entry. The
extension MUST NOT import code from the SDK or vice versa. The SDK MUST NOT
import code from the demo app. Coupling through shared file paths or implicit
JSON shape agreements is forbidden.

### IV. Test-First (NON-NEGOTIABLE)
Behavior-defining code MUST have tests written against it BEFORE the code is
written. The cycle is: write failing test → confirm it fails for the right
reason → implement minimum to pass → refactor. Coverage is not the goal;
behavior coverage is. Each user story in `/specs/*/spec.md` MUST map to at
least one acceptance test that an independent reviewer can run with a single
command. Integration tests that exercise the SDK → demo app → HTTP endpoint
loop are required for every contract boundary.

### V. Observability & Debuggability by Default
Every code path that can fail MUST fail loudly with a structured error. No
swallowed exceptions, no empty catch blocks, no fallback branches that paper
over a real bug. Telemetry emitted by the SDK MUST include a request
correlation id on every log line and every error so a developer can grep one
request end-to-end. The library MUST log to `console` with a consistent prefix
(`[api-spy]`) so its output is easy to filter from the host application's logs.

## Technology Constraints

- **Runtime**: Node.js ≥ 18. The SDK MUST rely only on Node built-ins plus
  declared npm dependencies. No native modules. No transpilation required at
  install time.
- **Module system**: ESM (`"type": "module"`). CJS interop is provided via the
  `api-spy` named exports only.
- **Async correlation**: `node:async_hooks.AsyncLocalStorage` is the ONLY
  approved mechanism for request-scoped context. The abandoned packages
  `continuation-local-storage` and `request-local-storage` MUST NOT be
  reintroduced.
- **Testing**: `node:test` (built-in) for unit tests; `supertest` for HTTP
  integration tests. No Mocha, no Jest for the SDK itself.
- **Linting/Formatting**: ESLint (flat config) + `eslint-config-standard`;
  Prettier with the default 100-col layout. CI fails on lint errors.
- **Dependency policy**: zero runtime deps in the SDK core if possible. If a
  dep is added, it MUST be actively maintained (last commit < 12 months) and
  MUST be < 100KB installed.

## Development Workflow

- **Spec-driven**: Every feature ships with a spec in `/specs/###-name/`
  produced via Spec Kit before any code is written.
- **Branching**: `master` is the default branch and is always shippable. Feature
  work happens on `###-feature-name` branches; PRs are squash-merged.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`,
  `test:`). The PR title MUST match the commit type.
- **Pre-merge gates** (all required, all enforced by CI):
  1. Tests pass (`npm test` in each affected package)
  2. Lint clean (`npm run lint`)
  3. No new dependency without a `CHANGELOG.md` entry
  4. Spec link present in PR description
- **Versioning**: SemVer. Breaking the public API or any contract requires a
  MAJOR bump and a migration note in `CHANGELOG.md`.

## Governance

- This Constitution supersedes all other practices. Where a default template,
  example, or external document conflicts with the Constitution, the
  Constitution wins.
- Amendments MUST be documented in a PR that updates
  `.specify/memory/constitution.md`, increments `CONSTITUTION_VERSION` per
  SemVer (MAJOR for principle additions/removals/redefinitions; MINOR for new
  sections; PATCH for clarifications), and lists every dependent artifact that
  needs follow-up.
- Each PR description MUST include a "Constitution Check" section that names
  every principle touched and confirms compliance. Complexities or trade-offs
  that appear to violate a principle MUST be justified in the same section
  before the PR is reviewed.
- Compliance review is the responsibility of the PR author first, the
  reviewer second. Silent violations are defects; call them out.

**Version**: 1.0.0 | **Ratified**: 2026-06-19 | **Last Amended**: 2026-06-19
