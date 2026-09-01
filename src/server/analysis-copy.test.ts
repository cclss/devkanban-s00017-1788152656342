import { describe, expect, it } from 'vitest'
import {
  aiFailureDetail,
  loadErrorMessage,
  loadFailureDetail,
  partialReasonMessage,
} from './analysis-copy'
import type { AiFailureReason, LoadFailureReason } from './analysis-copy'

/**
 * The English load-error / partial copy is the user-facing failure surface. These
 * tests pin the exact confirmed strings (mirroring the report demo copy in the
 * design spec) so a wording drift is caught here, not in the UI.
 */

describe('loadErrorMessage', () => {
  it('renders the confirmed private-address message', () => {
    expect(loadErrorMessage('private-address')).toBe(
      'Failed to load the page: Private network addresses are blocked.',
    )
  })

  it('shares the private-address copy for blocked localhost', () => {
    expect(loadErrorMessage('blocked-host')).toBe(
      'Failed to load the page: Private network addresses are blocked.',
    )
  })

  it('renders timeout / network / invalid-url causes', () => {
    expect(loadErrorMessage('timeout')).toContain('response timed out')
    expect(loadErrorMessage('network')).toContain('Could not connect')
    expect(loadErrorMessage('invalid-url')).toContain('URL format')
  })

  it('appends the status code in parentheses when present', () => {
    expect(loadErrorMessage('http-error', 500)).toBe(
      'Failed to load the page: The server returned an error status. (500)',
    )
  })
})

describe('partialReasonMessage', () => {
  it('matches the confirmed invalid-key partial copy', () => {
    expect(partialReasonMessage('invalid-key')).toBe(
      'AI evaluation unavailable: an API key error occurred, so only the automated audit results are shown.',
    )
  })

  it('renders the missing-key / rate-limit / parse-failure variants', () => {
    expect(partialReasonMessage('missing-key')).toBe(
      'AI evaluation unavailable: no API key was provided, so only the automated audit results are shown.',
    )
    expect(partialReasonMessage('rate-limit')).toContain('API usage limit was exceeded')
    expect(partialReasonMessage('parse-failure')).toContain(
      'AI response could not be interpreted',
    )
  })
})

describe('loadFailureDetail', () => {
  const REASONS: LoadFailureReason[] = [
    'invalid-url',
    'blocked-host',
    'private-address',
    'dns-failure',
    'timeout',
    'network',
    'http-error',
  ]

  it('returns a non-empty, actionable detail for every load-failure reason', () => {
    for (const reason of REASONS) {
      const detail = loadFailureDetail(reason)
      expect(detail.length).toBeGreaterThan(0)
      // Detail is richer than the one-line message (guidance, not just a cause).
      expect(detail.length).toBeGreaterThan(loadErrorMessage(reason).length)
    }
  })

  it('shares the SSRF guidance for private-address and blocked-host', () => {
    expect(loadFailureDetail('private-address')).toBe(loadFailureDetail('blocked-host'))
    expect(loadFailureDetail('private-address')).toContain('SSRF')
  })

  it('explains the http/timeout causes concretely', () => {
    expect(loadFailureDetail('http-error')).toContain('status code')
    expect(loadFailureDetail('timeout')).toContain('time limit')
  })
})

describe('aiFailureDetail', () => {
  const REASONS: AiFailureReason[] = [
    'missing-key',
    'invalid-key',
    'rate-limit',
    'parse-failure',
  ]

  it('returns a non-empty, actionable detail for every AI-failure reason', () => {
    for (const reason of REASONS) {
      const detail = aiFailureDetail(reason)
      expect(detail.length).toBeGreaterThan(0)
      expect(detail.length).toBeGreaterThan(partialReasonMessage(reason).length)
    }
  })

  it('explains the key and rate-limit causes concretely', () => {
    expect(aiFailureDetail('missing-key')).toContain('API key')
    expect(aiFailureDetail('invalid-key')).toContain('rejected')
    expect(aiFailureDetail('rate-limit')).toContain('limit')
    expect(aiFailureDetail('parse-failure')).toContain('JSON')
  })
})
