// computeGanttLayout.js — framework-free Gantt math.
// Ported from legacy/extension/api-spy-extension/public/scripts/panel.js
// lines 178-233. The math is pure; the React component owns all DOM.
// Spec: specs/003-overlay/data-model.md §Gantt Layout Schema

/**
 * @typedef {Object} Query
 * @property {string} id
 * @property {string} name
 * @property {string|null} parentQueryId
 * @property {string} startTime
 * @property {string|null} endTime
 * @property {number} durationInMilliseconds
 * @property {('ok'|'error')} status
 * @property {object|null} error
 * @property {Record<string, unknown>|null} metadata
 */

/**
 * @typedef {Object} GanttLayoutRow
 * @property {string} queryId
 * @property {string} name
 * @property {number} startPercent   0..100
 * @property {number} widthPercent   0..100 (min 0.5)
 * @property {('ok'|'error')} status
 * @property {number} durationMs
 */

/**
 * @typedef {Object} GanttLayout
 * @property {number} totalDurationMs
 * @property {number} totalStartTimeMs
 * @property {GanttLayoutRow[]} rows
 */

/**
 * @param {{ queries: Query[], totalDurationMs?: number, totalStartTimeMs?: number }} input
 * @returns {GanttLayout}
 */
export function computeGanttLayout (input) {
  const { queries = [], totalDurationMs: overrideTotalMs, totalStartTimeMs: overrideStartMs } = input || {}

  if (queries.length === 0) {
    return { rows: [], totalDurationMs: 0, totalStartTimeMs: 0 }
  }

  // Derive startMs (ms since epoch) from each query's ISO startTime.
  const startMsList = queries.map(q => Date.parse(q.startTime)).filter(n => Number.isFinite(n))
  const earliestStartMs = Math.min(...startMsList)
  const totalStartTimeMs = Number.isFinite(overrideStartMs) ? overrideStartMs : earliestStartMs

  // Derive endMs; queries without endTime default to startMs + duration.
  const endMsList = queries.map(q => {
    if (q.endTime) {
      const t = Date.parse(q.endTime)
      return Number.isFinite(t) ? t : Date.parse(q.startTime) + (q.durationInMilliseconds || 0)
    }
    return Date.parse(q.startTime) + (q.durationInMilliseconds || 0)
  })
  const latestEndMs = Math.max(...endMsList)

  const totalDurationMs = Number.isFinite(overrideTotalMs) && overrideTotalMs > 0
    ? overrideTotalMs
    : Math.max(1, latestEndMs - totalStartTimeMs)

  const rows = queries.map(q => {
    const qStartMs = Date.parse(q.startTime)
    const qDurationMs = q.durationInMilliseconds || 0
    let startPercent = ((qStartMs - totalStartTimeMs) / totalDurationMs) * 100
    let widthPercent = (qDurationMs / totalDurationMs) * 100

    // Clamp.
    if (startPercent < 0) startPercent = 0
    if (startPercent > 100) startPercent = 100
    if (widthPercent < 0.5) widthPercent = 0.5
    if (startPercent + widthPercent > 100) widthPercent = Math.max(0.5, 100 - startPercent)

    return {
      queryId: q.id,
      name: q.name,
      startPercent: round1(startPercent),
      widthPercent: round1(widthPercent),
      status: q.status,
      durationMs: qDurationMs
    }
  })

  return { totalDurationMs, totalStartTimeMs, rows }
}

function round1 (n) {
  return Math.round(n * 10) / 10
}
