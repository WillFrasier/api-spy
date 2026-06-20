// main.jsx — bootstraps React + the api-spy overlay for the demo page.
// React owns the entire #root: the demo's <main>, buttons, and <pre> are
// React children so they don't get clobbered when ApiSpyOverlay mounts.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ApiSpyOverlay } from 'api-spy-overlay-react'

// Buttons are grouped by what they demonstrate, so the page is readable
// at a glance as more scenarios get added.
const SECTIONS = [
  {
    heading: 'Basic shapes',
    scenarios: [
      { url: '/api/v1/users/42', label: '/users/:id — serial (db → http → llm)' },
      { url: '/api/v1/scenarios/parallel', label: '/scenarios/parallel — fan-out (3 in parallel)' },
      { url: '/api/v1/scenarios/mixed', label: '/scenarios/mixed — serial → parallel → serial' },
      { url: '/api/v1/scenarios/nested', label: '/scenarios/nested — 3 nested inside a wrapper' }
    ]
  },
  {
    heading: 'LLM',
    scenarios: [
      { url: '/api/v1/scenarios/llm-fanout', label: '/llm-fanout — 3 models in parallel (mini / gpt-4o / haiku)' },
      { url: '/api/v1/scenarios/llm-chain', label: '/llm-chain — 3 LLM calls in series (agent pattern)' },
      { url: '/api/v1/scenarios/slow', label: '/scenarios/slow — ~1.4s total (heavy LLM)' }
    ]
  },
  {
    heading: 'Volume',
    scenarios: [
      { url: '/api/v1/scenarios/burst', label: '/scenarios/burst — 5 calls in parallel' }
    ]
  },
  {
    heading: 'Errors',
    scenarios: [
      { url: '/api/v1/scenarios/error', label: '/scenarios/error — 503 (one child throws)' },
      { url: '/api/v1/scenarios/unauthorized', label: '/scenarios/unauthorized — 401 (no backend call)' },
      { url: '/api/v1/scenarios/notfound', label: '/scenarios/notfound — 404 (db miss)' },
      { url: '/api/v1/scenarios/server-error', label: '/scenarios/server-error — 500 (LLM 500)' }
    ]
  }
]

function DemoApp () {
  const [status, setStatus] = useState('idle')
  const [out, setOut] = useState('click a button to make a request')
  const [busyUrl, setBusyUrl] = useState(null)

  const onHit = async (url) => {
    if (busyUrl) return
    setBusyUrl(url)
    setStatus(`loading ${url}…`)
    setOut('…')
    try {
      const res = await fetch(url)
      const text = await res.text()
      let pretty = text
      try { pretty = JSON.stringify(JSON.parse(text), null, 2) } catch (_) { /* keep raw */ }
      setOut(`HTTP ${res.status}\n${pretty}`)
      const rid = res.headers.get('X-ApiSpy-RequestId')
      setStatus(`done (X-ApiSpy-RequestId: ${rid ? rid.slice(0, 8) + '…' : 'none'})`)
    } catch (err) {
      setOut('fetch failed: ' + err.message)
      setStatus('error')
    } finally {
      setBusyUrl(null)
    }
  }

  return (
    <>
      <main>
        <h1>api-spy demo</h1>
        <p>
          This page is a normal React app. The <code>&lt;ApiSpyOverlay /&gt;</code> mounts
          itself in the bottom-right corner, opens a WebSocket to{' '}
          <code>/api/v1/apiSpyControl</code>, and shows a Gantt chart filling in as your
          server-side calls complete.
        </p>

        {SECTIONS.map((section) => (
          <React.Fragment key={section.heading}>
            <h2 className="scenarios-heading">{section.heading}</h2>
            <div className="row row--wrap">
              {section.scenarios.map((s) => (
                <button
                  key={s.url}
                  data-hit={s.url}
                  disabled={busyUrl === s.url}
                  onClick={() => onHit(s.url)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </React.Fragment>
        ))}

        <div className="row">
          <span className="status">{status}</span>
        </div>
        <pre>{out}</pre>
      </main>
      <ApiSpyOverlay position="bottom-right" />
    </>
  )
}

const container = document.getElementById('root')
const root = createRoot(container)
root.render(<DemoApp />)
