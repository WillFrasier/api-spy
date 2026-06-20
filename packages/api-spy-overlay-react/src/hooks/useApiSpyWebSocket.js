// useApiSpyWebSocket.js — opens a WebSocket to the api-spy control
// endpoint and dispatches incoming messages into a reducer.
//
// Spec: specs/003-overlay/spec.md §FR-009..FR-010, US5.
//
// State model:
//   - requests: Map<requestId, { status, queries[], startedAt, completedAt? }>
//   - selectedId: requestId | null
// Incoming WS messages dispatch updates; UI re-renders on state change.
import { useEffect, useReducer, useRef } from 'react'

const DEFAULT_PATH = '/api/v1/apiSpyControl'

/**
 * @param {{ path?: string, maxRequests?: number }} [opts]
 */
export function useApiSpyWebSocket (opts = {}) {
  const path = opts.path || DEFAULT_PATH
  const maxRequests = opts.maxRequests || 50
  const [state, dispatch] = useReducer(reducer, { requests: new Map(), order: [] })
  const wsRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    function connect () {
      if (cancelled) return
      const url = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${path}`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0
      }
      ws.onmessage = (event) => {
        let msg
        try { msg = JSON.parse(event.data) } catch { return }
        if (msg.type === 'query') dispatch({ type: 'query', payload: msg })
        else if (msg.type === 'request-complete') dispatch({ type: 'request-complete', payload: msg })
        else if (msg.type === 'pong') { /* keepalive */ }
      }
      ws.onerror = () => { /* close will follow */ }
      ws.onclose = () => {
        if (cancelled) return
        // Exponential backoff: 500ms, 1s, 2s, ... capped at 30s
        const delay = Math.min(30000, 500 * Math.pow(2, reconnectAttemptsRef.current))
        reconnectAttemptsRef.current++
        setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      cancelled = true
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [path])

  return {
    requests: Array.from(state.requests.values()).sort((a, b) => b.startedAt - a.startedAt).slice(0, maxRequests),
    dispatch
  }
}

function reducer (state, action) {
  if (action.type === 'query') {
    const { requestId, query } = action.payload
    if (!requestId) return state
    const requests = new Map(state.requests)
    const existing = requests.get(requestId) || { id: requestId, status: 'pending', queries: [], startedAt: Date.now() }
    const updated = {
      ...existing,
      queries: [...existing.queries, query]
    }
    requests.set(requestId, updated)
    const order = state.order.includes(requestId) ? state.order : [...state.order, requestId]
    return { requests, order }
  }
  if (action.type === 'request-complete') {
    const { requestId, status, durationInMilliseconds } = action.payload
    const requests = new Map(state.requests)
    const existing = requests.get(requestId)
    if (!existing) return state
    requests.set(requestId, { ...existing, status, durationInMilliseconds, completedAt: Date.now() })
    return { ...state, requests }
  }
  return state
}
