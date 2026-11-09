/**
 * Small in-memory TTL cache with LRU eviction and in-flight request de-duplication.
 * Keeps the UI snappy (back/forward, revisiting rows) and spares the TMDB rate limit.
 */
export class TtlCache {
  constructor(maxEntries = 800) {
    this.maxEntries = maxEntries;
    /** @type {Map<string, { value: unknown, expires: number }>} */
    this.entries = new Map();
    /** @type {Map<string, Promise<unknown>>} */
    this.pending = new Map();
  }

  get(key) {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh LRU position.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key, value, ttlMs) {
    if (ttlMs <= 0) return;
    this.entries.delete(key);
    this.entries.set(key, { value, expires: Date.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      this.entries.delete(oldest);
    }
  }

  /** Returns a cached value, joins an identical in-flight request, or runs `load`. */
  async wrap(key, ttlMs, load) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const inflight = this.pending.get(key);
    if (inflight) return inflight;
    const promise = (async () => {
      try {
        const value = await load();
        this.set(key, value, ttlMs);
        return value;
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, promise);
    return promise;
  }

  clear() {
    this.entries.clear();
    this.pending.clear();
  }
}
