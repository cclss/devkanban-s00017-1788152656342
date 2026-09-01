import { describe, expect, it, vi } from 'vitest'
import { runLoad, type LoadFetch } from './load-stage'

/**
 * The load stage is the SSRF-guarded, timeout-bounded fetch — the only stage
 * that fails terminally. These tests confirm the guard blocks private targets
 * before any fetch, and that success / non-2xx / network / timeout each map to
 * the right outcome, all with a mocked fetch (no real network).
 */

const HTML = '<html lang="ko"><title>x</title></html>'
const PUBLIC_URL = 'https://93.184.216.34/'

function okFetch(): LoadFetch {
  return async () => ({ ok: true, status: 200, text: async () => HTML })
}

describe('runLoad', () => {
  it('returns the HTML on a 2xx public fetch', async () => {
    const result = await runLoad(PUBLIC_URL, {
      fetchImpl: okFetch(),
      guardOptions: { allowPrivateNetwork: true },
    })
    expect(result).toEqual({ ok: true, html: HTML, statusCode: 200 })
  })

  it('blocks a private IP before fetching', async () => {
    const fetchImpl = vi.fn<LoadFetch>()
    const result = await runLoad('http://10.0.0.5/', { fetchImpl })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.report.outcome).toBe('error-load')
      expect(result.report.message).toContain('Private network')
    }
  })

  it('blocks an invalid URL', async () => {
    const result = await runLoad('not-a-url', { fetchImpl: okFetch() })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.report.message).toContain('URL format')
  })

  it('maps a non-2xx status to an http-error report with the code', async () => {
    const fetchImpl: LoadFetch = async () => ({ ok: false, status: 404, text: async () => '' })
    const result = await runLoad(PUBLIC_URL, {
      fetchImpl,
      guardOptions: { allowPrivateNetwork: true },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.report.statusCode).toBe(404)
      expect(result.report.message).toContain('(404)')
    }
  })

  it('maps a rejected fetch to a network error', async () => {
    const fetchImpl: LoadFetch = async () => {
      throw new Error('ECONNRESET')
    }
    const result = await runLoad(PUBLIC_URL, {
      fetchImpl,
      guardOptions: { allowPrivateNetwork: true },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.report.message).toContain('Could not connect')
  })

  it('attaches an actionable detail to a load failure', async () => {
    const result = await runLoad('http://10.0.0.5/', { fetchImpl: okFetch() })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.report.detail).toBeDefined()
      // The detail is richer guidance than the one-line message.
      expect(result.report.detail!.length).toBeGreaterThan(result.report.message.length)
      expect(result.report.detail).toContain('SSRF')
    }
  })

  it('maps an aborted (timed-out) fetch to a timeout error', async () => {
    // fetchImpl rejects only once the signal aborts, so a 1ms timeout fires.
    const fetchImpl: LoadFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    const result = await runLoad(PUBLIC_URL, {
      fetchImpl,
      guardOptions: { allowPrivateNetwork: true },
      timeoutMs: 1,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.report.message).toContain('response timed out')
  })
})
