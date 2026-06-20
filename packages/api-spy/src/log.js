// T006 — minimal logger with [api-spy] prefix.
// Covers: FR-012 (single log line on init; prefix consistent)
// Contract: see data-model.md §log

const PREFIX = '[api-spy]'

// We import context lazily so log() works even before init() has wired
// the ALS instance (and inside test harnesses that import log first).
let _getActiveContext = () => null

export function bindContextAccessor (fn) {
  _getActiveContext = typeof fn === 'function' ? fn : () => null
}

/**
 * Emit a single log line.
 *
 * @param {'info'|'warn'|'error'} level
 * @param {string} message
 */
export function log (level, message) {
  const ctx = _getActiveContext()
  const tail = ctx?.id ? ` requestId=${ctx.id}` : ''
  const line = `${PREFIX}${tail} ${message}`
  const stream =
    level === 'error' ? console.error :
    level === 'warn' ? console.warn :
    console.log
  stream(line)
}