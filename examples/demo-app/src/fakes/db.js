// T037 — fake DB call. Simulates 30ms latency, returns deterministic user.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function findUser (id) {
  await sleep(30)
  return {
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`
  }
}