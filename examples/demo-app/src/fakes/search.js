// search.js — fake search call. Variable latency chosen per call
// so parallel-vs-serial scenarios look different on the Gantt.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function search (query, latencyMs = 80) {
  await sleep(latencyMs)
  return { query, hits: 42, latencyMs }
}

// A second fake for the "slow" scenario — simulates a heavy LLM call.
export async function heavySummarize (text) {
  // 1.2s — long enough to fill the Gantt chart visibly.
  await sleep(1200)
  return { text, summary: text.slice(0, 80) + '…', latencyMs: 1200 }
}
