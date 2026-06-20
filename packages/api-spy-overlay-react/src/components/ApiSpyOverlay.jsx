// ApiSpyOverlay.jsx — top-level React component. Mounts the gliph + panel.
// Spec: specs/003-overlay/spec.md §FR-008, §US1, §US2.
import React, { useState } from 'react'
import { useApiSpyWebSocket } from '../hooks/useApiSpyWebSocket.js'
import { Gliph } from './Gliph.jsx'
import { Panel } from './Panel.jsx'
import '../styles.css'

/**
 * @param {{ position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left', maxRequests?: number, path?: string }} props
 */
export function ApiSpyOverlay ({ position = 'bottom-right', maxRequests = 50, path } = {}) {
  const [isOpen, setIsOpen] = useState(false)
  const { requests } = useApiSpyWebSocket({ path, maxRequests })
  const count = requests.length
  const errorCount = requests.reduce(
    (n, r) => n + (r && r.status === 'error' ? 1 : 0),
    0
  )

  return (
    <div className={`api-spy-root api-spy-root--${position}`}>
      {isOpen && <Panel requests={requests} onClose={() => setIsOpen(false)} />}
      <Gliph
        count={count}
        errorCount={errorCount}
        isOpen={isOpen}
        onClick={() => setIsOpen((o) => !o)}
      />
    </div>
  )
}
