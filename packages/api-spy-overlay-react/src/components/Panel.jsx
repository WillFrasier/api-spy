// Panel.jsx — the open panel showing the request list and the selected
// request's Gantt chart.
// Spec: specs/003-overlay/spec.md §US2, FR-014.
import React, { useState } from 'react'
import { GanttChart } from './GanttChart.jsx'

/**
 * @param {{ requests: Array<any>, onClose: () => void }} props
 */
export function Panel ({ requests, onClose }) {
  const [selectedId, setSelectedId] = useState(requests[0]?.id ?? null)
  const selected = requests.find(r => r.id === selectedId) || requests[0]

  return (
    <div className="api-spy-panel" role="dialog" aria-label="api-spy debug panel">
      <div className="api-spy-panel__header">
        <span className="api-spy-panel__title">api-spy — live requests</span>
        <button className="api-spy-panel__close" onClick={onClose} aria-label="close">×</button>
      </div>
      <div className="api-spy-panel__body">
        <div className="api-spy-panel__list">
          {requests.length === 0 && <div className="api-spy-panel__empty">no requests captured yet</div>}
          {requests.map((r) => (
            <button
              key={r.id}
              className={`api-spy-request api-spy-request--${r.status} ${r.id === selected?.id ? 'api-spy-request--selected' : ''}`}
              onClick={() => setSelectedId(r.id)}
            >
              <span className="api-spy-request__id">{r.id.slice(0, 8)}</span>
              <span className="api-spy-request__count">{r.queries.length} {r.queries.length === 1 ? 'call' : 'calls'}</span>
              <span className={`api-spy-request__status api-spy-request__status--${r.status}`}>{r.status}</span>
              {r.durationInMilliseconds != null && <span className="api-spy-request__duration">{r.durationInMilliseconds}ms</span>}
            </button>
          ))}
        </div>
        <div className="api-spy-panel__detail">
          {selected ? (
            <>
              <div className="api-spy-panel__detail-header">
                <span className="api-spy-panel__detail-id">{selected.id}</span>
                <span className={`api-spy-panel__detail-status api-spy-panel__detail-status--${selected.status}`}>{selected.status}</span>
                {selected.durationInMilliseconds != null && <span className="api-spy-panel__detail-duration">{selected.durationInMilliseconds}ms total</span>}
              </div>
              <GanttChart queries={selected.queries} />
            </>
          ) : (
            <div className="api-spy-panel__empty">click a request to see its Gantt</div>
          )}
        </div>
      </div>
    </div>
  )
}
