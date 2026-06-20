// bin/dev.js — one-command dev launcher.
//
// Picks a free port for the Express server (starting at PORT=3000 or
// whatever's set in env), picks a free port for the Vite dev server
// (starting at VITE_PORT=5173), spawns both, prints URLs.
//
// Run with:  npm run dev
//
// Same-origin doesn't matter here — Vite proxies /api + WS through to
// Express. The URLs are independent (you open the Vite one), but they
// have to coordinate on the API port via env.
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const API_START = Number(process.env.PORT || 3000)
const WEB_START = Number(process.env.VITE_PORT || 5173)
const MAX_PROBES = 20

/**
 * Find a free TCP port starting at `start`. Returns the port number.
 * Probes by binding briefly then releasing — there's a tiny TOCTOU
 * race, so each child also retries on EADDRINUSE for robustness.
 */
function findFreePort (start) {
  return new Promise((resolve, reject) => {
    let attempt = 0
    function tryOnce () {
      const port = start + attempt
      const tester = createServer()
      tester.unref()
      tester.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempt < MAX_PROBES) {
          attempt++
          tryOnce()
        } else {
          reject(err)
        }
      })
      tester.once('listening', () => {
        tester.close(() => resolve(port))
      })
      tester.listen(port, '::')
    }
    tryOnce()
  })
}

const apiPort = await findFreePort(API_START)
const webPort = await findFreePort(WEB_START)

// eslint-disable-next-line no-console
console.log(`[api-spy-dev] api  -> http://localhost:${apiPort}`)
// eslint-disable-next-line no-console
console.log(`[api-spy-dev] web  -> http://localhost:${webPort}    <-- open this in your browser`)
// eslint-disable-next-line no-console
console.log(`[api-spy-dev] ws   -> ws://localhost:${apiPort}/api/v1/apiSpyControl`)

const api = spawn(process.execPath, [resolve(root, 'src/server.js')], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PORT: String(apiPort) }
})

const web = spawn('npx', ['vite', '--port', String(webPort), '--strictPort'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, PORT: String(apiPort), VITE_PORT: String(webPort) }
})

let cleaned = false
function cleanup (code) {
  if (cleaned) return
  cleaned = true
  api.kill('SIGTERM')
  web.kill('SIGTERM')
  process.exit(code ?? 0)
}

process.on('SIGINT', () => cleanup(130))
process.on('SIGTERM', () => cleanup(143))
api.on('exit', (code) => cleanup(code ?? 0))
web.on('exit', (code) => cleanup(code ?? 0))
