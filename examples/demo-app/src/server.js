// T039 — demo app Express bootstrap.
// Wires apiSpy.expressMiddleware(), the wsHandler, the users route, the
// debugger route, and a small static page that hosts the React overlay.

import express from 'express'
import { createServer as createHttpServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import * as apiSpy from 'api-spy'
import usersRouter from './routes/users.js'
import debuggerRouter from './routes/debugger.js'
import scenariosRouter from './routes/scenarios.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createApp () {
  const app = express()
  app.use(express.json())
  // The SDK middleware MUST be mounted before any route that calls
  // apiSpy.track(). Body parsers are safe to run first.
  app.use(apiSpy.expressMiddleware())
  app.use('/api/v1/users', usersRouter)
  app.use('/api/v1/apiDebugger', debuggerRouter)
  app.use('/api/v1/scenarios', scenariosRouter)

  // Error handler — surfaces route-level errors as JSON. The api-spy
  // middleware has already recorded the request as status=error and
  // emitted request-complete on the WS stream.
  app.use((err, req, res, _next) => {
    const status = err.status || err.statusCode || 500
    res.status(status).json({
      error: 'request_failed',
      message: err.message,
      requestId: res.getHeader('X-ApiSpy-RequestId')
    })
  })

  // Static page that hosts the React overlay (built to ../public).
  const publicDir = resolve(__dirname, '../public')
  app.use(express.static(publicDir))

  return app
}

// If run directly (not imported), start listening.
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  const startPort = Number(process.env.PORT || 3000)
  const app = createApp()
  // The http.Server is what receives WS upgrades, so we have to wire
  // wsHandler() at the http.Server layer (not as Express middleware).
  const server = createHttpServer(app)
  // Guard against double-listen — wsHandler setup is async, and we
  // start listening on success OR failure, whichever happens first.
  let listenStarted = false
  const startListening = () => {
    if (listenStarted) return
    listenStarted = true
    listenWithRetry(server, startPort)
  }
  apiSpy.wsHandler({ path: '/api/v1/apiSpyControl' })(server)
    .then(startListening)
    .catch((err) => {
       
      console.error('[api-spy] failed to attach wsHandler:', err.message)
      startListening()
    })
  // Safety net: don't wait forever for wsHandler to load.
  setTimeout(startListening, 1500)
}

/**
 * Listen on `startPort`. If EADDRINUSE, try the next port up — handles
 * the TOCTOU race between `findFreePort()` and a concurrent bind.
 * Logs the actual port so the caller knows where to point the browser.
 */
function listenWithRetry (server, startPort, maxProbes = 20) {
  let attempt = 0
  function tryListen () {
    const port = startPort + attempt
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && attempt < maxProbes) {
        attempt++
        tryListen()
      } else {
         
        console.error(`[api-spy] failed to bind after ${attempt} attempts:`, err.message)
        process.exit(1)
      }
    })
    server.listen(port, '::', () => {
       
      console.log(`[api-spy] demo app listening on http://localhost:${port}`)
       
      console.log(`[api-spy] overlay at http://localhost:${port}/`)
    })
  }
  tryListen()
}
