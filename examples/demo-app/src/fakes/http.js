// T037 — fake HTTP fetch. Simulates 60ms latency, returns a profile.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function fetchProfile (userId) {
  await sleep(60)
  return {
    userId,
    theme: userId % 2 === 0 ? 'dark' : 'light',
    text: 'Some user bio or notes used as LLM context. Lorem ipsum dolor sit amet.'
  }
}