// wsHandler.js — attaches a WebSocket server to a Node http.Server for
// broadcasting api-spy query events.
//
// Spec: specs/003-overlay/spec.md §FR-002..FR-007
//
// Design:
// - 'ws' is loaded via dynamic import — it's an optional peer dep so the
//   SDK core stays zero-dep. Calling wsHandler() without 'ws' installed
//   throws a helpful error at the time the server is wired up.
// - One WebSocketServer per http.Server, attached on `upgrade` events.
// - A module-level subscriber Set is updated via the onQuery hook
//   (composed in this file).
// - The expressMiddleware emits `request-complete` for every request.
//
// Usage:
//   const server = createServer(app)
//   apiSpy.wsHandler({ path: '/api/v1/apiSpyControl' })(server)
//   server.listen(3000)

import { setOnQuery } from './onQuery.js'

const DEFAULT_PATH = '/api/v1/apiSpyControl'

/** @type {Set<any>} */
const subscribers = new Set()

/** Cached reference to the `ws` module so we only dynamic-import once. */
let _wsModule = null
let _wsLoadPromise = null

async function loadWs () {
  if (_wsModule) return _wsModule
  if (_wsLoadPromise) return _wsLoadPromise
  _wsLoadPromise = (async () => {
    try {
      const mod = await import('ws')
      _wsModule = mod
      return mod
    } catch (err) {
      _wsLoadPromise = null
      throw new Error(
        'api-spy.wsHandler() requires the "ws" package. Install it with `npm install ws` ' +
        '(Error: ' + (err && err.message) + ')'
      )
    }
  })()
  return _wsLoadPromise
}

/**
 * Returns a function that attaches a WebSocket server to the given
 * http.Server. This is the seam the spec describes as
 * "app.use(apiSpy.wsHandler())"; in practice WebSocket upgrades bypass
 * Express, so we expose a server-attaching function instead.
 *
 * @param {{ path?: string }} [opts]
 * @returns {(server: any) => Promise<void>}
 */
export function wsHandler (opts = {}) {
  const path = opts.path || DEFAULT_PATH

  // Install the onQuery broadcaster once.
  setOnQuery((ctx, query) => {
    if (subscribers.size === 0) return
    const msg = JSON.stringify({ type: 'query', requestId: ctx?.id ?? null, query })
    for (const ws of subscribers) {
      if (ws.readyState === 1 /* OPEN */) {
        try { ws.send(msg) } catch (_) { /* socket may be mid-close */ }
      }
    }
  })

  return async function attachWebSocketServer (httpServer) {
    if (!httpServer || typeof httpServer.on !== 'function') {
      throw new Error('api-spy.wsHandler()(...): first arg must be a Node http.Server')
    }
    const wsMod = await loadWs()
    const WebSocketServer = wsMod.WebSocketServer || wsMod.Server || wsMod.default?.WebSocketServer
    if (!WebSocketServer) {
      throw new Error('unable to find WebSocketServer export in "ws" module')
    }
    const wss = new WebSocketServer({ noServer: true })

    httpServer.on('upgrade', (req, socket, head) => {
      // Strip query string for path comparison
      const reqPath = (req.url || '').split('?')[0]
      if (reqPath !== path) return
      wss.handleUpgrade(req, socket, head, (clientWs) => {
        wss.emit('connection', clientWs, req)
      })
    })

    wss.on('connection', (clientWs) => {
      subscribers.add(clientWs)
      clientWs.on('close', () => subscribers.delete(clientWs))
      clientWs.on('error', () => { /* close will follow */ })

      clientWs.on('message', (data) => {
        let msg
        try { msg = JSON.parse(data.toString()) } catch (_) { return }
        if (msg && msg.type === 'ping') {
          try { clientWs.send(JSON.stringify({ type: 'pong', t: msg.t })) } catch (_) {}
        }
      })
    })
  }
}

/**
 * Send a `request-complete` message to all subscribers. Called by
 * expressMiddleware after saving the request record.
 * @param {string} requestId
 * @param {('ok'|'error')} status
 * @param {number} durationInMilliseconds
 */
export function emitRequestComplete (requestId, status, durationInMilliseconds) {
  if (subscribers.size === 0) return
  const msg = JSON.stringify({
    type: 'request-complete',
    requestId,
    status,
    durationInMilliseconds
  })
  for (const ws of subscribers) {
    if (ws.readyState === 1) {
      try { ws.send(msg) } catch (_) { /* socket may be mid-close */ }
    }
  }
}

/**
 * Test-only: clear all subscribers.
 */
export function _resetSubscribersForTests () {
  subscribers.clear()
}
