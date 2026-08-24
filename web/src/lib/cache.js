import { NextResponse } from 'next/server'

/**
 * Tiny in-process TTL cache for near-static reads (boards, curriculum).
 * No Redis — process-local only; fine for single-node / serverless warm instances.
 */
const store = new Map()

export function cacheGet(key) {
  const hit = store.get(key)
  if (!hit) return undefined
  if (Date.now() > hit.expiresAt) {
    store.delete(key)
    return undefined
  }
  return hit.value
}

export function cacheSet(key, value, ttlMs = 60_000) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
  return value
}

export function cacheDelete(prefixOrKey) {
  if (!store.has(prefixOrKey) && !prefixOrKey.endsWith('*')) {
    store.delete(prefixOrKey)
    return
  }
  const prefix = prefixOrKey.replace(/\*$/, '')
  for (const key of store.keys()) {
    if (key === prefixOrKey || key.startsWith(prefix)) store.delete(key)
  }
}

/** LRU + TTL map for insight LLM results. */
export function createBoundedTtlCache({ max = 40, ttlMs = 10 * 60_000 } = {}) {
  const map = new Map()
  return {
    get(key) {
      const hit = map.get(key)
      if (!hit) return undefined
      if (Date.now() > hit.expiresAt) {
        map.delete(key)
        return undefined
      }
      // refresh LRU order
      map.delete(key)
      map.set(key, hit)
      return hit.value
    },
    set(key, value) {
      if (map.has(key)) map.delete(key)
      map.set(key, { value, expiresAt: Date.now() + ttlMs })
      while (map.size > max) {
        const oldest = map.keys().next().value
        map.delete(oldest)
      }
      return value
    },
    delete(key) {
      map.delete(key)
    },
    clear() {
      map.clear()
    },
  }
}

export function jsonCached(data, { status = 200, maxAge = 60, private: isPrivate = false } = {}) {
  const res = NextResponse.json(data, { status })
  const scope = isPrivate ? 'private' : 'public'
  res.headers.set('Cache-Control', `${scope}, max-age=${maxAge}, stale-while-revalidate=${maxAge * 5}`)
  return res
}
