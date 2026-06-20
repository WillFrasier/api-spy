// llm.js — fake LLM calls. Simulates latency + produces tokens + cost
// metadata that flows into the api-spy query record so it shows up in
// the overlay's Gantt bar and the debugger JSON.
//
// Cost model (approximate, June 2026):
//   gpt-4o-mini:   $0.15 / 1M input,  $0.60 / 1M output
//   gpt-4o:        $2.50 / 1M input,  $10.00 / 1M output
//   claude-haiku:  $0.80 / 1M input,  $4.00 / 1M output
//   llama-3.1-70b: $0.59 / 1M input,  $0.79 / 1M output
//
// These are example numbers; the point is the metadata, not the prices.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PRICING = {
  'gpt-4o-mini':    { inputPer1M: 0.15,  outputPer1M: 0.60 },
  'gpt-4o':         { inputPer1M: 2.50,  outputPer1M: 10.00 },
  'claude-haiku':   { inputPer1M: 0.80,  outputPer1M: 4.00 },
  'llama-3.1-70b':  { inputPer1M: 0.59,  outputPer1M: 0.79 }
}

// 1 token ≈ 4 chars of English text (rough). For a fake we don't need exact
// tiktoken — we just want realistic numbers in the metadata.
function estimateTokens (text) {
  return Math.max(1, Math.round((text || '').length / 4))
}

function priceFor (model, tokensIn, tokensOut) {
  const p = PRICING[model]
  if (!p) return 0
  return (tokensIn / 1_000_000) * p.inputPer1M + (tokensOut / 1_000_000) * p.outputPer1M
}

// Long fake responses for the "verbose" call so the output token count is visible.
const VERBOSE_BODIES = {
  'gpt-4o-mini':
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
    'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. ' +
    'Duis aute irure dolor in reprehenderit in voluptate velit esse. ' +
    'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.',
  'gpt-4o':
    'In a hole in the ground there lived a hobbit. Not a nasty, dirty, wet hole, ' +
    'filled with the ends of worms and an oozy smell, nor yet a dry, bare, sandy hole ' +
    'with nothing in it to sit down on or to eat: it was a hobbit-hole, and that means comfort.',
  'claude-haiku':
    'Call me Ishmael. Some years ago—never mind how long precisely—having little ' +
    'or no money in my purse, and nothing particular to interest me on shore, ' +
    'I thought I would sail about a little and see the watery part of the world.',
  'llama-3.1-70b':
    'It was the best of times, it was the worst of times, it was the age of wisdom, ' +
    'it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity.'
}

// Cheap, fast call used by /users/:id.
export async function summarize (input) {
  await sleep(120)
  return `Summary of ${input.name || input.id}: short and snappy.`
}

// Verbose call used by the new LLM-only scenario. Takes a real prompt and
// a model; computes tokens + cost as if the call had really happened.
export async function chatCompletion ({ prompt, model = 'gpt-4o-mini' } = {}) {
  const tokensIn = estimateTokens(prompt)
  // Simulate latency scaled by model "size" so the Gantt has variety.
  const latencyByModel = { 'gpt-4o-mini': 250, 'gpt-4o': 900, 'claude-haiku': 350, 'llama-3.1-70b': 600 }
  const latencyMs = latencyByModel[model] || 400
  await sleep(latencyMs)
  const body = VERBOSE_BODIES[model] || VERBOSE_BODIES['gpt-4o-mini']
  const tokensOut = estimateTokens(body)
  const costUsd = priceFor(model, tokensIn, tokensOut)
  return { text: body, model, tokensIn, tokensOut, latencyMs, costUsd }
}
