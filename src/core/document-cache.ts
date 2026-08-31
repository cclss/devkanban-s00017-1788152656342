/**
 * A small promise-keyed cache used to load each source PDF document at most
 * once (source documents are loaded lazily and cached for thumbnail rendering).
 *
 * Kept free of any pdf.js dependency so the caching contract — dedup concurrent
 * loads, memoise the resolved value, and evict a failed load so it can be
 * retried — is unit-testable in isolation. The pdf.js-backed renderer in
 * {@link ./thumbnail} instantiates one of these keyed by source-file id.
 *
 * @typeParam T Whatever the loader resolves to (a `PDFDocumentProxy` in
 *              production; a stub in tests).
 */
export class AsyncKeyedCache<T> {
  /**
   * Stores the in-flight/resolved *promise* rather than the value, so N
   * concurrent `getOrLoad` calls for the same key share a single load instead
   * of racing to start N of them.
   */
  private readonly entries = new Map<string, Promise<T>>()

  /**
   * Returns the cached promise for `key`, invoking `load` only on a miss.
   *
   * On a cache hit the same promise is returned, so a value is computed exactly
   * once per key even under concurrency. If the load rejects, the entry is
   * evicted (provided it hasn't already been replaced) so a later call can
   * retry rather than being permanently poisoned by a transient failure.
   *
   * @param key  Cache key (e.g. a source-file id).
   * @param load Thunk that produces the value; called only on a miss.
   */
  getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key)
    if (existing) return existing

    const created = load()
    this.entries.set(key, created)

    // Evict on rejection so failures are retryable — but only if this exact
    // promise is still the stored one, to avoid clobbering a newer entry.
    void created.catch(() => {
      if (this.entries.get(key) === created) this.entries.delete(key)
    })

    return created
  }

  /** Whether a (resolved or in-flight) entry exists for `key`. */
  has(key: string): boolean {
    return this.entries.has(key)
  }

  /**
   * Drops the entry for `key`, returning whether one existed. The next
   * `getOrLoad` for that key will load afresh.
   */
  delete(key: string): boolean {
    return this.entries.delete(key)
  }

  /** Removes every entry. */
  clear(): void {
    this.entries.clear()
  }

  /** Number of cached entries. */
  get size(): number {
    return this.entries.size
  }
}
