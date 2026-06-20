# api-spy

A Node SDK that captures the **call graph** of slow backend operations —
HTTP, database, LLM — for each incoming request, and exposes it as JSON
over an `/apiDebugger/:id` endpoint that a future browser debugger (or
`curl`) can inspect.

## Why

Seeing the API call graph in the browser is good. But seeing the calls that the API makes is essential. Which database calls are taking the longest? What calls are happening in parallel? How many tokens are being sent to the LLM, and how much did the request cost?

The goal of api-spy is to provide a small component that can be added to any Node.js application to help you understand the external calls that are being made from within the api layer.

## Install

### Server

```js
import express from "express";
import * as apiSpy from "api-spy";

const app = express();
app.use(apiSpy.expressMiddleware()); // open a request context

app.get("/users/:id", async (req, res, next) => {
  const user = await apiSpy.track(
    "db.users.findById", // unique name for the call
    () => db.findUser(req.params.id), // the call to make
    { metadata: { table: "users", id: req.params.id } }, // optional metadata to attach to the call
  );
  res.json(user);
});

app.listen(3000);
```

Requirements on server setup:

{Fill this in once we have a spec}

### Client

```js
import { ApiSpyOverlay } from 'api-spy-overlay-react'
export function App() {
  return (
    <>
      <YourStuff />
      {/* Enable the overlay to see the call graph */}
      <ApiSpyOverlay position="bottom-right" />
    </>
  )
}
```




## Contributing

See `specs/001-phase1-sdk-foundation/spec.md` for the design rationale and
`specs/001-phase1-sdk-foundation/tasks.md` for the task breakdown. PRs that
touch the public API should add a test under `tests/contract/`.

## License

ISC — see [LICENSE](./LICENSE).
