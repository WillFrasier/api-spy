// onQuery.js — registry for the user-supplied onQuery hook.
// The track() implementation invokes whatever hook is currently set
// (or none) after each query finalizes. The wsHandler() in 003-overlay
// subscribes by setting its own hook via init({ onQuery }).
//
// This is a module-level mutable singleton — same pattern as _store().
// Multiple subscribers can chain by reading the previous value.

/** @type {((ctx: any, query: any) => void) | null} */
let _hook = null

/**
 * Set the active onQuery hook. Pass null to clear.
 * @param {((ctx: any, query: any) => void) | null} hook
 */
export function setOnQuery (hook) {
  _hook = hook
}

/**
 * @returns {((ctx: any, query: any) => void) | null}
 */
export function getOnQuery () {
  return _hook
}

/**
 * Test-only reset. NOT exported from index.js — tests use it via
 * `_resetOnQueryForTests` which re-exports this.
 */
export function _reset () {
  _hook = null
}
