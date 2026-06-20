// T037 — fake LLM call. Simulates 120ms latency + token-based cost metadata.
// (Your real-world ask: surface tokensIn/tokensOut/costUsd on every LLM call.)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function summarize (input) {
  await sleep(120)
  return `Summary of ${input.name || input.id}: short and snappy.`
}