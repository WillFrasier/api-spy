// /tmp/llm-probe.mjs — verify LLM metadata flows through the WS broadcast.
import { WebSocket } from 'ws'

const API = process.env.API_PORT || '3000'
const url = `ws://localhost:${API}/api/v1/apiSpyControl`

const ws = new WebSocket(url)

ws.on('open', async () => {
  console.log('WS connected')

  const collected = []
  ws.on('message', (data) => {
    let msg
    try { msg = JSON.parse(data.toString()) } catch { return }
    if (msg.type === 'query' && msg.query && msg.query.metadata) {
      collected.push(msg.query)
    }
  })

  for (const path of ['/api/v1/scenarios/llm-fanout', '/api/v1/scenarios/llm-chain']) {
    const res = await fetch(`http://localhost:${API}${path}`)
    console.log(`  fired ${path} -> HTTP ${res.status}`)
    await new Promise(r => setTimeout(r, 50))
  }
  await new Promise(r => setTimeout(r, 1500))

  console.log('\n=== query messages with metadata (WS broadcast) ===')
  for (const q of collected) {
    const m = q.metadata || {}
    const cost = m.costUsd != null ? `$${m.costUsd.toFixed(6)}` : '?'
    const tokens = (m.tokensIn != null && m.tokensOut != null) ? `${m.tokensIn}->${m.tokensOut}` : '?'
    console.log(`  - ${q.name.padEnd(28)} | ${String(q.durationInMilliseconds).padStart(4)}ms | cost=${cost.padEnd(11)} | tokens=${tokens.padEnd(10)} | provider=${m.provider || '?'}`)
  }
  console.log(`\n  ${collected.length} query events with metadata captured (expected 6)`)
  ws.close()
  process.exit(collected.length === 6 ? 0 : 1)
})

ws.on('error', (err) => {
  console.error('WS error:', err.message)
  process.exit(1)
})