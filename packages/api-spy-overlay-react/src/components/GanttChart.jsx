// GanttChart.jsx — renders a Gantt chart from a list of queries.
// Spec: specs/003-overlay/spec.md §US2, FR-014..FR-015.
//
// Each bar's label is the query name + duration. If the query carries
// api-spy metadata (e.g. tokensIn/tokensOut/costUsd for LLM calls), the
// bar also shows the most useful summary: cost for LLM-style calls,
// a compact "key=value" string otherwise.
import React from 'react'
import { computeGanttLayout } from '../lib/computeGanttLayout.js'

// Format a USD number compactly: $1.23, $0.0123, $0.000456, $1.2k
function formatUsd (n) {
  if (!Number.isFinite(n)) return ''
  if (n === 0) return '$0'
  if (n < 0.0001) return `$${n.toExponential(1)}`
  if (n < 1) return `$${n.toFixed(4)}`
  if (n < 100) return `$${n.toFixed(3)}`
  if (n < 100_000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  return `$${(n / 1000).toFixed(1)}k`
}

// Build the right-side "summary" string for a bar from its metadata.
// Returns null when the metadata is empty / useless.
function barSummary (query) {
  const md = (query && query.metadata) || null
  if (!md) return null
  const cost = typeof md.costUsd === 'number' ? md.costUsd : null
  const tIn = typeof md.tokensIn === 'number' ? md.tokensIn : null
  const tOut = typeof md.tokensOut === 'number' ? md.tokensOut : null
  if (cost !== null) {
    // LLM-shaped metadata: show cost + tokens if we have them.
    if (tIn !== null && tOut !== null) {
      return `${formatUsd(cost)} · ${tIn}→${tOut} tok`
    }
    return formatUsd(cost)
  }
  // Generic metadata: pick the first 2 string/number values as a fallback.
  const entries = Object.entries(md).filter(([, v]) => v === 0 || v)
  if (entries.length === 0) return null
  return entries.slice(0, 2).map(([k, v]) => `${k}=${typeof v === 'number' ? v : String(v)}`).join(' · ')
}

/**
 * @param {{ queries: import('../lib/computeGanttLayout.js').Query[] }} props
 */
export function GanttChart ({ queries }) {
  if (!queries || queries.length === 0) {
    return <div className="api-spy-gantt api-spy-gantt--empty">no queries yet</div>
  }
  const layout = computeGanttLayout({ queries })
  // Build a lookup so we can attach each bar to its original query (for metadata).
  const byId = new Map((queries || []).map((q) => [q.id, q]))

  return (
    <div className="api-spy-gantt">
      <div className="api-spy-gantt__timeline" style={{ position: 'relative', height: `${layout.rows.length * 26}px` }}>
        {layout.rows.map((row, i) => {
          const q = byId.get(row.queryId) || {}
          const summary = barSummary(q)
          const titleParts = [`${row.name} — ${row.durationMs}ms`]
          if (summary) titleParts.push(summary)
          return (
            <div
              key={row.queryId}
              className={`api-spy-gantt__bar api-spy-gantt__bar--${row.status}`}
              style={{
                position: 'absolute',
                left: `${row.startPercent}%`,
                width: `${row.widthPercent}%`,
                top: `${i * 26}px`,
                height: '20px'
              }}
              title={titleParts.join(' · ')}
            >
              <span className="api-spy-gantt__label">{row.name}</span>
              <span className="api-spy-gantt__bar-right">
                {summary && <span className="api-spy-gantt__bar-summary">{summary}</span>}
                <span className="api-spy-gantt__duration">{row.durationMs}ms</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
