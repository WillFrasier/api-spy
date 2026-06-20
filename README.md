# api-spy

Instrument the backend calls your API makes — DB, HTTP, LLM — and watch them on a live Gantt chart inside your app.

![api-spy overlay](./api-spy.png)

## What it is

- An Express middleware + `track()` helper that records every call your handler makes.
- A React component (`<ApiSpyOverlay />`) that floats in the corner of the page and shows the call graph as it fills in.
- A `/apiDebugger/:id` endpoint that returns the full call tree as JSON.

The goal: know what the API is doing, without adding logging everywhere.

## Install

```bash
npm install api-spy api-spy-overlay-react ws
```

`ws` is an optional peer dep — only needed if you want the live overlay. The debugger endpoint works without it.

## Usage

### Server — instrument a route

```js
import express from "express";
import * as apiSpy from "api-spy";

const app = express();
app.use(apiSpy.expressMiddleware()); // open a request context
apiSpy.wsHandler({ path: "/api/v1/apiSpyControl" }); // optional, for the overlay

app.get("/users/:id", async (req, res) => {
  const user = await apiSpy.track(
    "db.users.findById",
    () => db.findUser(req.params.id),
    { metadata: { table: "users", id: req.params.id } },
  );
  res.json(user);
});
```

### Client — mount the overlay

```jsx
import { ApiSpyOverlay } from "api-spy-overlay-react";

export function App() {
  return (
    <>
      <YourStuff />
      <ApiSpyOverlay position="bottom-right" />
    </>
  );
}
```

Hit a route and the overlay fills in the Gantt chart for that request in real time.

## Demo

```bash
cd examples/demo-app
npm install
npm run dev
```

Then open the printed Vite URL. The page has buttons for serial, parallel, nested, slow, errored, and LLM fan-out scenarios.

## Contributing

- `specs/001-phase1-sdk-foundation/spec.md` — SDK contract.
- `specs/003-overlay/spec.md` — overlay + WebSocket contract.

PRs that touch the public API need a test under `tests/contract/`.

## License

ISC — see [LICENSE](./LICENSE).
