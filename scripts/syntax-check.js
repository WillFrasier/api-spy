#!/usr/bin/env node
// scripts/syntax-check.js — parse-check every .js / .mjs file in the
// monorepo using `node --check`. This is a zero-dependency way to
// catch syntax errors before lint even runs (e.g. typos, missing
// braces). ESLint catches style and idiomatic issues; this catches
// "won't parse at all" issues faster than a full lint pass.
//
// Scope: src/ + tests/ in the 3 active packages. Excludes:
//   - node_modules
//   - any directory starting with .
//   - examples/demo-app/index.html, vite.config.js — actually included
//     because vite.config.js is .js

import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = new URL('..', import.meta.url).pathname

const PACKAGES = [
  'packages/api-spy/src',
  'packages/api-spy/tests',
  'packages/api-spy-overlay-react/src',
  'packages/api-spy-overlay-react/tests',
  'examples/demo-app/src',
  'examples/demo-app/tests',
  'examples/demo-app/bin'
]

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage'])
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs'])

/**
 * Recursively walk `dir`, yielding every file path whose extension
 * is in EXTENSIONS. Skips SKIP_DIRS.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function walk (dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch (err) {
    if (err.code === 'ENOENT') return out
    throw err
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...walk(full))
    } else if (stat.isFile()) {
      const dot = name.lastIndexOf('.')
      const ext = dot >= 0 ? name.slice(dot) : ''
      if (EXTENSIONS.has(ext)) out.push(full)
    }
  }
  return out
}

const t0 = Date.now()
const files = PACKAGES.flatMap((p) => walk(join(ROOT, p)))

if (files.length === 0) {
  console.log('lint:js-syntax: no files to check')
  process.exit(0)
}

console.log(`lint:js-syntax: checking ${files.length} files`)

let passed = 0
let failed = 0
/** @type {string[]} */
const failures = []

for (const file of files) {
  const rel = relative(ROOT, file)
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: ['ignore', 'pipe', 'pipe']
  })
  if (result.status === 0) {
    passed++
  } else {
    failed++
    failures.push(rel)
    const stderr = result.stderr ? result.stderr.toString().trim() : ''
    console.error(`  ✗ ${rel}`)
    if (stderr) {
      for (const line of stderr.split('\n')) {
        console.error(`    ${line}`)
      }
    }
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(2)

if (failed === 0) {
  console.log(`lint:js-syntax: ✓ ${passed}/${files.length} files OK (${elapsed}s)`)
  process.exit(0)
} else {
  console.error(`lint:js-syntax: ✗ ${failed}/${files.length} files failed (${elapsed}s)`)
  console.error('failures:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}