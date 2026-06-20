// /tmp/dev-integration.mjs — end-to-end integration check for the
// demo dev server. Run with: node /tmp/dev-integration.mjs
//
// Assumes npm run dev is already running (it just needs to find an
// api server on 3000 and a vite server on 5173). It does NOT manage
// the dev server lifecycle — caller starts/stops it.
import { WebSocket } from 'ws'
import { request } from 'node:http'

const API = 'http://localhost:3000'
const WEB = 'http://localhost:5173'

function get (url) {
  return new Promise((resolve, reject) => {
    request(url, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    }).on('error', reject).end()
  })
}

let pass = 0, fail = 0
function check (label, cond, detail) {
  if (cond) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✖ ${label}${detail ? '\n     ' + detail : ''}`) }
}

console.log('1) GET /api/v1/users/42 — the instrumented route')
const r1 = await get(API + '/api/v1/users/42')
check('status 200', r1.status === 200, `got ${r1.status}`)
const rid = r1.headers['x-apispy-requestid']
check('X-ApiSpy-RequestId present', !!rid, rid || '(missing)')
check('X-ApiSpy-RequestId is a v4 UUID', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(rid || ''), rid)
const body = JSON.parse(r1.body)
check('response body has id,name,theme,summary', body.id === '42' && !!body.name && !!body.theme && !!body.summary, JSON.stringify(body))

console.log('\n2) GET /api/v1/apiDebugger/:id — the post-mortem endpoint')
const r2 = await get(API + '/api/v1/apiDebugger/' + rid)
check('status 200', r2.status === 200, `got ${r2.status}`)
const dbg = JSON.parse(r2.body)
check('debugger returns requestId matching header', dbg.requestId === rid, `${dbg.requestId} vs ${rid}`)
check('debugger returns 3 queries (db, http, llm)', dbg.queries.length === 3, `got ${dbg.queries.length}`)
const names = dbg.queries.map(q => q.name)
check('queries include db.users.findById', names.includes('db.users.findById'))
check('queries include http.upstream.profile', names.includes('http.upstream.profile'))
check('queries include llm.gpt-4o-mini.summarize', names.includes('llm.gpt-4o-mini.summarize'))
const llm = dbg.queries.find(q => q.name.startsWith('llm.'))
check('LLM query carries tokens + cost metadata',
  llm && llm.metadata && typeof llm.metadata.tokensIn === 'number' && typeof llm.metadata.costUsd === 'number',
  JSON.stringify(llm?.metadata))

console.log('\n3) WebSocket /api/v1/apiSpyControl — receives query events')
const events = []
const ws = new WebSocket('ws://localhost:3000/api/v1/apiSpyControl')
await new Promise((resolve, reject) => {
  ws.once('open', resolve)
  ws.once('error', reject)
  setTimeout(() => reject(new Error('WS open timeout')), 3000)
})
ws.on('message', d => events.push(JSON.parse(d.toString())))

// Trigger an instrumented request to make the server push events
await get(API + '/api/v1/users/42')

// Wait for events to arrive
const start = Date.now()
while (events.filter(e => e.type === 'query').length < 3 && Date.now() - start < 2000) {
  await new Promise(r => setTimeout(r, 25))
}

const queryEvents = events.filter(e => e.type === 'query')
const completeEvents = events.filter(e => e.type === 'request-complete')
check('received 3 query events', queryEvents.length === 3, `got ${queryEvents.length}`)
check('query events have the correct names',
  queryEvents.map(e => e.query.name).sort().join(',') === ['db.users.findById', 'http.upstream.profile', 'llm.gpt-4o-mini.summarize'].sort().join(','),
  queryEvents.map(e => e.query.name).join(','))
check('query events carry a requestId', queryEvents.every(e => e.requestId && /^[0-9a-f-]{36}$/.test(e.requestId)))
check('received a request-complete event', completeEvents.length >= 1, `got ${completeEvents.length}`)
const lastComplete = completeEvents[completeEvents.length - 1]
check('request-complete has status=ok', lastComplete?.status === 'ok', JSON.stringify(lastComplete))

// ping/pong
const pongP = new Promise(r => {
  ws.on('message', d => {
    const m = JSON.parse(d.toString())
    if (m.type === 'pong') r(m)
  })
})
ws.send(JSON.stringify({ type: 'ping', t: 12345 }))
const pong = await Promise.race([pongP, new Promise((_, rj) => setTimeout(() => rj(new Error('no pong')), 1000))])
check('ping → pong round-trip', pong && pong.t === 12345, JSON.stringify(pong))

ws.close()

console.log('\n4) GET / — the React overlay page (Vite)')
const r4 = await get(WEB + '/')
check('Vite serves the demo HTML', r4.status === 200, `got ${r4.status}`)
check('HTML references the React entry', r4.body.includes('/src/main.jsx'), r4.body.slice(0, 200))

console.log(`\n=== ${pass} passed, ${fail} failed ===`)
process.exit(fail > 0 ? 1 : 0)
