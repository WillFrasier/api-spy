// T008 — in-memory LRU store.
// Covers: FR-005 (capacity 1000, LRU eviction), §Edge Cases (eviction logging)
// Contract: data-model.md §Store, §Capacity & Eviction
//
// LRU implementation: a Map keeps insertion order; on `get` we re-insert
// the key to bump it to most-recent. On `save` when size > capacity,
// the oldest key (Map iteration order) is evicted.

import { log } from './log.js'

const DEFAULT_CAPACITY = 1000

/**
 * @typedef {Object} RequestRecord
 * @property {string} id
 * @property {string} startTime
 * @property {string|null} endTime
 * @property {number} durationInMilliseconds
 * @property {('ok'|'error'|'incomplete')} status
 * @property {object|null} error
 * @property {object[]} queries
 */

/**
 * @typedef {Object} Store
 * @property {(record: RequestRecord) => void} save
 * @property {(id: string) => (RequestRecord|undefined)} get
 * @property {() => void} [dispose]
 */

/**
 * Create a bounded in-memory LRU store.
 *
 * @param {{capacity?: number}} [opts]
 * @returns {Store}
 */
export function createInMemoryStore (opts = {}) {
  const capacity = Number.isInteger(opts.capacity) && opts.capacity > 0 ? opts.capacity : DEFAULT_CAPACITY
  /** @type {Map<string, RequestRecord>} */
  const map = new Map()

  function evictIfFull () {
    if (map.size <= capacity) return
    const oldestKey = map.keys().next().value
    if (oldestKey !== undefined) {
      map.delete(oldestKey)
      log('info', `evicted requestId=${oldestKey}`)
    }
  }

  return {
    save (record) {
      if (!record || typeof record.id !== 'string') {
        throw new TypeError('[api-spy] store.save() requires a record with a string id')
      }
      // Saving an existing id should update the value AND bump it to most-recent.
      if (map.has(record.id)) map.delete(record.id)
      map.set(record.id, record)
      evictIfFull()
    },
    get (id) {
      const value = map.get(id)
      if (value === undefined) return undefined
      // Bump recency: delete + re-set moves the key to the end of insertion order.
      map.delete(id)
      map.set(id, value)
      return value
    },
    size () { return map.size },
    dispose () { map.clear() }
  }
}