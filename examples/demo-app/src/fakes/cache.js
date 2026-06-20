// cache.js — fake cache hit. Returns instantly (0ms) so the Gantt
// shows a near-zero-width bar — useful to demonstrate that even
// cache hits are visible.

export async function getCached (key) {
  return { key, value: 'cached-payload', hit: true }
}
