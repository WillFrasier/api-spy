#!/usr/bin/env node
// scripts/blt.js — single command to run lint, syntax-check, and tests
// across every package in the api-spy monorepo.
//
// Usage:   npm run blt
//
// Phases (fail-fast — first failure stops the whole run):
//   1. lint         ESLint over src + tests in all 3 packages
//   2. lint:js-syntax  node --check on every .js / .mjs source file
//   3. test         each package's own test:all / test script
//
// Each phase is independently runnable from package.json so contributors
// can iterate on one phase without invoking the others.

import { spawnSync } from 'node:child_process'

const ROOT = new URL('..', import.meta.url).pathname

/** @type {{ name: string, cmd: string, args: string[], cwd: string }[]} */
const PHASES = [
  {
    name: 'lint (eslint)',
    cmd: 'npm',
    args: ['run', 'lint'],
    cwd: ROOT
  },
  {
    name: 'lint:js-syntax (node --check)',
    cmd: 'npm',
    args: ['run', 'lint:js-syntax'],
    cwd: ROOT
  },
  {
    name: 'test:sdk',
    cmd: 'npm',
    args: ['run', 'test:sdk'],
    cwd: ROOT
  },
  {
    name: 'test:overlay',
    cmd: 'npm',
    args: ['run', 'test:overlay'],
    cwd: ROOT
  },
  {
    name: 'test:demo',
    cmd: 'npm',
    args: ['run', 'test:demo'],
    cwd: ROOT
  }
]

function banner (text) {
  const line = '─'.repeat(Math.max(text.length + 4, 40))
  console.log(`\n\x1b[36m${line}\x1b[0m`)
  console.log(`\x1b[36m│ ${text}\x1b[0m`)
  console.log(`\x1b[36m${line}\x1b[0m`)
}

function runPhase (phase) {
  banner(phase.name)
  const result = spawnSync(phase.cmd, phase.args, {
    cwd: phase.cwd,
    stdio: 'inherit',
    env: process.env
  })
  if (result.error) {
    console.error(`\x1b[31mblt: failed to spawn ${phase.cmd}: ${result.error.message}\x1b[0m`)
    return { ok: false, error: result.error }
  }
  if (result.status !== 0) {
    console.error(`\x1b[31mblt: ${phase.name} exited with status ${result.status}\x1b[0m`)
    return { ok: false, code: result.status }
  }
  return { ok: true }
}

const t0 = Date.now()
let failures = 0

for (const phase of PHASES) {
  const result = runPhase(phase)
  if (!result.ok) {
    failures++
    break // fail-fast: no point running later phases
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(2)

if (failures === 0) {
  console.log(`\n\x1b[32m✓ blt: all phases passed (${elapsed}s)\x1b[0m`)
  process.exit(0)
} else {
  console.log(`\n\x1b[31m✗ blt: 1 phase failed (${elapsed}s)\x1b[0m`)
  process.exit(1)
}