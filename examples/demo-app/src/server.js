// T039 — demo app Express bootstrap.
// Wires apiSpy.expressMiddleware(), the users route, and the debugger route.

import express from 'express'
import * as apiSpy from 'api-spy'
import usersRouter from './routes/users.js'
import debuggerRouter from './routes/debugger.js'

export default function createServer () {
  const app = express()
  app.use(express.json())
  // The SDK middleware MUST be mounted before any route that calls
  // apiSpy.track(). Body parsers are safe to run first.
  app.use(apiSpy.expressMiddleware())
  app.use('/api/v1/users', usersRouter)
  app.use('/api/v1/apiDebugger', debuggerRouter)
  return app
}

// If run directly (not imported), start listening.
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  const port = Number(process.env.PORT || 3000)
  const app = createServer()
  // eslint-disable-next-line no-console
  console.log(`[api-spy] demo app listening on http://localhost:${port}`)
  app.listen(port)
}