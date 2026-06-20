# api-spy

A Node debugger that runs in your browser and shows the live graph of slow
backend operations — HTTP calls, database queries, LLM calls — performed
for each top-level request.

```js
import express from 'express'
import * as apiSpy from 'api-spy'

const app = express()
app.use(apiSpy.express())                  // open a request context, tag the response

app.get('/users/:id', async (req, res) => {
  const user = await apiSpy.track('db.users.findById', () =>
    db.users.findById(req.params.id)
  )
  res.json(user)
})

app.get('/api/v1/apiDebugger/:id', (req, res) => {
  const record = apiSpy._store().get(req.params.id)
  if (!record) return res.status(404).json({ error: 'not_found', requestId: req.params.id })
  res.json(record)
})
```

After hitting `/users/42`, fetch the assembled tree:

```bash
curl http://localhost:3000/api/v1/apiDebugger/<X-ApiSpy-RequestId-from-prior-curl>
```

## Project layout

```
api-spy/
├── packages/
│   └── api-spy/                  ← the SDK (this is what you npm install)
├── examples/
│   └── demo-app/                 ← runnable demo, clone-and-go
├── specs/                        ← Spec-Driven Development artifacts
│   └── 001-phase1-sdk-foundation/
└── legacy/                       ← pre-Phase 1 code, preserved for reference
```

## Quickstart (the demo)

```bash
git clone https://github.com/WillFrasier/api-spy.git
cd api-spy
cd examples/demo-app
npm install
npm run demo
# in another terminal:
curl -i http://localhost:3000/api/v1/users/42
# copy the X-ApiSpy-RequestId from the response headers, then:
curl http://localhost:3000/api/v1/apiDebugger/<that-id> | jq .
```

See [`packages/api-spy/README.md`](./packages/api-spy/README.md) for the
full API reference.

## Status

- **Phase 1 (SDK foundation)**: spec at
  [`specs/001-phase1-sdk-foundation/spec.md`](./specs/001-phase1-sdk-foundation/spec.md)
- Chrome extension rewrite, MV3 migration, npm publish, Redis storage, and
  real LLM/HTTP provider wrappers are deferred to follow-on specs.

## License

ISC — see [LICENSE](./LICENSE).