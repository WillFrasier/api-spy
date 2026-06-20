// Gliph.jsx — the small floating button that shows the request count
// and toggles the panel.
// Spec: specs/003-overlay/spec.md §US1, FR-011.
import React from 'react'

/**
 * @param {{ count: number, errorCount?: number, isOpen: boolean, onClick: () => void, onMouseDown?: (e: any) => void }} props
 */
export function Gliph ({ count, errorCount = 0, isOpen, onClick, onMouseDown }) {
  const hasErrors = errorCount > 0
  const title = hasErrors
    ? `api-spy: ${count} request${count === 1 ? '' : 's'} (${errorCount} errored)`
    : `api-spy: ${count} request${count === 1 ? '' : 's'}`
  return (
    <button
      className={`api-spy-gliph ${hasErrors ? 'api-spy-gliph--has-errors' : ''}`}
      onClick={onClick}
      onMouseDown={onMouseDown}
      aria-label="api-spy debug overlay"
      title={title}
    >
      <span className="api-spy-gliph__dot" />
      <span className="api-spy-gliph__count">{count}</span>
      {hasErrors && <span className="api-spy-gliph__error-count">{errorCount}</span>}
      <span className="api-spy-gliph__label">api-spy</span>
    </button>
  )
}
