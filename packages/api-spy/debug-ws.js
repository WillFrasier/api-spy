// Debug script: try to reproduce the hang
import express from 'express'
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import * as apiSpy from 'api-spy'

console.log('[debug] starting')
const app = express()
app.get('/x', (req, res) => res.json({ ok: true }))

const server = createServer(app)
// attach WS handler to the server (not as Express middleware)
apiSpy.wsHandler({ path: '/ws' })(server).then(() => {
  console.log('[debug] ws attached')
  server.listen(0, () => {
    const { port } = server.address()
    console.log('[debug] listening on', port)
    const ws = new WebSocket(`ws://localhost:${port}/ws`)
    ws.on('open', () => {
      console.log('[debug] ws open')
      ws.close()
      server.close(() => {
        console.log('[debug] done')
        process.exit(0)
      })
    })
    ws.on('error', (err) => {
      console.log('[debug] ws error:', err.message)
      process.exit(1)
    })
    setTimeout(() => { console.log('[debug] timeout'); process.exit(1) }, 5000)
  })
}).catch((err) => {
  console.log('[debug] attach failed:', err.message)
  process.exit(1)
})
