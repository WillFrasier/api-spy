// wsHandler.test.js — TDD for the SDK WebSocket handler.
// Spec: specs/003-overlay/spec.md §FR-002..FR-007.
// Verifies: WS upgrade, query broadcast, request-complete broadcast,
// ping/pong round-trip, disconnect cleanup, multi-subscriber fan-out.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import * as apiSpy from 'api-spy'
import { run, track, _resetOnQueryForTests } from 'api-spy'

// Set up a fresh app + http.Server + wsHandler for each test
async function makeApp () {
  _resetOnQueryForTests()
  const app = express()
  app.use(apiSpy.expressMiddleware())
  app.get('/api/v1/users/:id', async (req, res, next) => {
    try {
      await run(async () => {
        await track('db.find', async () => {
          await new Promise(r => setTimeout(r, 20))
        })
        await track('http.fetch', async () => {
          await new Promise(r => setTimeout(r, 30))
        })
      }, { id: req.headers['x-apispy-requestid'] })
      res.json({ id: req.params.id })
    } catch (err) { next(err) }
  })

  const server = createServer(app)
  await apiSpy.wsHandler({ path: '/api/v1/apiSpyControl' })(server)
  await new Promise((resolve) => server.listen(0, resolve))
  const { port } = server.address()
  return { app, server, port }
}

function teardown (server) {
  return new Promise((resolve) => {
    // Force-close any lingering WS connections
    server.closeAllConnections?.()
    server.close(resolve)
  })
}

test('wsHandler upgrades HTTP to WebSocket on the configured path', async () => {
  const { server, port } = await makeApp()
  try {
    const ws = new WebSocket(`ws://localhost:${port}/api/v1/apiSpyControl`)
    await new Promise((resolve, reject) => {
      ws.once('open', resolve)
      ws.once('error', reject)
    })
    assert.equal(ws.readyState, WebSocket.OPEN)
    ws.close()
  } finally {
    await teardown(server)
  }
})

test('wsHandler broadcasts a "query" message for each track() in a request', async () => {
  const { server, port } = await makeApp()
  try {
    const ws = new WebSocket(`ws://localhost:${port}/api/v1/apiSpyControl`)
    await new Promise((resolve) => ws.once('open', resolve))

    const messages = []
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())))

    await fetch(`http://localhost:${port}/api/v1/users/42`)

    const start = Date.now()
    while (messages.filter(m => m.type === 'query').length < 2 && Date.now() - start < 2000) {
      await new Promise(r => setTimeout(r, 10))
    }
    const queryMsgs = messages.filter(m => m.type === 'query')
    assert.equal(queryMsgs.length, 2)
    const names = queryMsgs.map(m => m.query.name).sort()
    assert.deepEqual(names, ['db.find', 'http.fetch'])
    for (const m of queryMsgs) {
      assert.equal(typeof m.requestId, 'string')
      assert.match(m.requestId, /^[0-9a-f-]{36}$/)
    }

    ws.close()
  } finally {
    await teardown(server)
  }
})

test('wsHandler broadcasts "request-complete" after the request finalizes', async () => {
  const { server, port } = await makeApp()
  try {
    const ws = new WebSocket(`ws://localhost:${port}/api/v1/apiSpyControl`)
    await new Promise((resolve) => ws.once('open', resolve))

    const messages = []
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())))

    await fetch(`http://localhost:${port}/api/v1/users/42`)

    const start = Date.now()
    while (!messages.some(m => m.type === 'request-complete') && Date.now() - start < 2000) {
      await new Promise(r => setTimeout(r, 10))
    }
    const complete = messages.find(m => m.type === 'request-complete')
    assert.ok(complete, 'expected a request-complete message')
    assert.equal(complete.status, 'ok')
    assert.equal(typeof complete.durationInMilliseconds, 'number')

    ws.close()
  } finally {
    await teardown(server)
  }
})

test('wsHandler replies to "ping" with "pong"', async () => {
  const { server, port } = await makeApp()
  try {
    const ws = new WebSocket(`ws://localhost:${port}/api/v1/apiSpyControl`)
    await new Promise((resolve) => ws.once('open', resolve))

    const pongPromise = new Promise((resolve) => {
      ws.on('message', (data) => {
        const m = JSON.parse(data.toString())
        if (m.type === 'pong') resolve(m)
      })
    })

    ws.send(JSON.stringify({ type: 'ping', t: Date.now() }))
    const pong = await pongPromise
    assert.equal(pong.type, 'pong')
    assert.equal(typeof pong.t, 'number')

    ws.close()
  } finally {
    await teardown(server)
  }
})

test('wsHandler fans out messages to multiple subscribers', async () => {
  const { server, port } = await makeApp()
  try {
    const ws1 = new WebSocket(`ws://localhost:${port}/api/v1/apiSpyControl`)
    const ws2 = new WebSocket(`ws://localhost:${port}/api/v1/apiSpyControl`)
    await Promise.all([
      new Promise(r => ws1.once('open', r)),
      new Promise(r => ws2.once('open', r))
    ])

    const m1 = [], m2 = []
    ws1.on('message', d => m1.push(JSON.parse(d.toString())))
    ws2.on('message', d => m2.push(JSON.parse(d.toString())))

    await fetch(`http://localhost:${port}/api/v1/users/42`)

    const start = Date.now()
    while (m1.filter(m => m.type === 'query').length < 2 && Date.now() - start < 2000) {
      await new Promise(r => setTimeout(r, 10))
    }
    await new Promise(r => setTimeout(r, 100))
    assert.equal(m1.filter(m => m.type === 'query').length, 2)
    assert.equal(m2.filter(m => m.type === 'query').length, 2)

    ws1.close(); ws2.close()
  } finally {
    await teardown(server)
  }
})

test('wsHandler unsubscribes a disconnected client and the server keeps serving', async () => {
  const { server, port } = await makeApp()
  try {
    const ws = new WebSocket(`ws://localhost:${port}/api/v1/apiSpyControl`)
    await new Promise((resolve) => ws.once('open', resolve))
    const closePromise = new Promise((resolve) => ws.once('close', resolve))
    ws.close()
    await closePromise
    await new Promise(r => setTimeout(r, 50))
    const res = await fetch(`http://localhost:${port}/api/v1/users/42`)
    assert.equal(res.status, 200)
  } finally {
    await teardown(server)
  }
})
