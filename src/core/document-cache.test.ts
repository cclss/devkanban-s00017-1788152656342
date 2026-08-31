import { describe, it, expect, vi } from 'vitest'
import { AsyncKeyedCache } from './document-cache'

/** A deferred promise so tests can control resolution timing. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('AsyncKeyedCache — load-once semantics', () => {
  it('invokes the loader only once per key across repeated gets', async () => {
    const cache = new AsyncKeyedCache<number>()
    const load = vi.fn(async () => 42)

    const a = await cache.getOrLoad('k', load)
    const b = await cache.getOrLoad('k', load)

    expect(a).toBe(42)
    expect(b).toBe(42)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent gets into a single in-flight load', async () => {
    const cache = new AsyncKeyedCache<string>()
    const d = deferred<string>()
    const load = vi.fn(() => d.promise)

    const p1 = cache.getOrLoad('k', load)
    const p2 = cache.getOrLoad('k', load)
    // Both callers share the one pending promise before it resolves.
    expect(load).toHaveBeenCalledTimes(1)

    d.resolve('doc')
    expect(await p1).toBe('doc')
    expect(await p2).toBe('doc')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('loads independently for distinct keys', async () => {
    const cache = new AsyncKeyedCache<string>()
    const load = vi.fn(async (v: string) => v)

    const a = await cache.getOrLoad('a', () => load('A'))
    const b = await cache.getOrLoad('b', () => load('B'))

    expect(a).toBe('A')
    expect(b).toBe('B')
    expect(load).toHaveBeenCalledTimes(2)
    expect(cache.size).toBe(2)
  })
})

describe('AsyncKeyedCache — failure eviction', () => {
  it('evicts a rejected load so the next get retries', async () => {
    const cache = new AsyncKeyedCache<number>()
    const load = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(7)

    await expect(cache.getOrLoad('k', load)).rejects.toThrow('transient')
    // The poisoned entry was dropped, so a retry re-invokes the loader.
    const retried = await cache.getOrLoad('k', load)

    expect(retried).toBe(7)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not evict a newer entry that replaced a rejected one', async () => {
    const cache = new AsyncKeyedCache<string>()
    const failing = deferred<string>()

    // First load will reject, but we replace the key before it settles.
    const p1 = cache.getOrLoad('k', () => failing.promise)
    cache.delete('k')
    const good = await cache.getOrLoad('k', async () => 'fresh')

    failing.reject(new Error('late failure'))
    await expect(p1).rejects.toThrow('late failure')

    // The late rejection must not have removed the good entry.
    expect(good).toBe('fresh')
    expect(cache.has('k')).toBe(true)
  })
})

describe('AsyncKeyedCache — bookkeeping', () => {
  it('reports has/size and supports delete + clear', async () => {
    const cache = new AsyncKeyedCache<number>()
    expect(cache.size).toBe(0)
    expect(cache.has('k')).toBe(false)

    await cache.getOrLoad('k', async () => 1)
    expect(cache.has('k')).toBe(true)
    expect(cache.size).toBe(1)

    expect(cache.delete('k')).toBe(true)
    expect(cache.delete('k')).toBe(false)
    expect(cache.has('k')).toBe(false)

    await cache.getOrLoad('a', async () => 1)
    await cache.getOrLoad('b', async () => 2)
    expect(cache.size).toBe(2)
    cache.clear()
    expect(cache.size).toBe(0)
  })
})
