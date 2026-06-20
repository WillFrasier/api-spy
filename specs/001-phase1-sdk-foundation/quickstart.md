# Quickstart: Phase 1 SDK Foundation

**Time to first request tree**: under 5 minutes from `git clone`.

## Prerequisites

- Node.js ≥ 18 LTS (`node --version` should print `v18.x` or higher)
- `npm` (bundled with Node)
- `curl` (or any HTTP client)

## Steps

### 1. Clone & install the SDK

```bash
git clone https://github.com/WillFrasier/api-spy.git
cd api-spy
cd packages/api-spy
npm install
```

The SDK has zero runtime dependencies. `npm install` should complete in
under 10 seconds.

### 2. Run the SDK test suite

```bash
npm test
```

Expected output: all unit, contract, and integration tests pass.

### 3. Install and run the demo app

```bash
cd ../../examples/demo-app
npm install
npm run demo
```

The demo should log within ~1 second:

```
[api-spy] store=InMemoryStore capacity=1000
[api-spy] demo app listening on http://localhost:3000
```

### 4. Make a request and capture the id

```bash
curl -i http://localhost:3000/api/v1/users/42
```

Look for the `X-ApiSpy-RequestId` response header. Copy its value.

### 5. Fetch the assembled request tree

```bash
curl http://localhost:3000/api/v1/apiDebugger/<paste-id-here> | jq .
```

You should see a JSON body matching the shape in
`specs/001-phase1-sdk-foundation/contracts/api-debugger-response.example.json`:
a request id, timing block, and a `queries` array containing the demo's
three instrumented calls (one DB-shaped, one HTTP-shaped, one LLM-shaped).

### 6. Tear down

Ctrl-C the demo process. Hit the debugger endpoint with a non-existent
id to confirm `404`:

```bash
curl -i http://localhost:3000/api/v1/apiDebugger/not-a-real-id
# HTTP/1.1 404 Not Found
# {"error":"not_found","requestId":"not-a-real-id"}
```

## Using the SDK in your own app

Three lines in your Express bootstrap:

```js
import express from 'express'
import * as apiSpy from 'api-spy'

const app = express()
app.use(apiSpy.express())             // ← before routes
app.use('/api/v1/users', usersRouter) // your routes
app.get('/api/v1/apiDebugger/:id', debuggerRouter)
```

Then wrap any slow call:

```js
app.get('/api/v1/users/:id', async (req, res) => {
  const user = await apiSpy.track('db.users.findById', () =>
    db.users.findById(req.params.id)
  )
  res.json(user)
})
```

That's it. The SDK handles request correlation, timing, error capture,
and tree assembly. The debugger endpoint surfaces it for any consumer.
