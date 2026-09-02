import { describe, expect, it } from 'vitest'
import {
  AI_SKIP_REASON_PREFIX,
  PARTIAL_REASON_PREFIX,
  aiFailureDetail,
  isAiSkip,
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

  it('frames missing-key as a neutral skip, not a failure', () => {
    // The no-key case reads as a deliberate skip ("skipped" / "entered"),
    // distinct from the "unavailable" failure prefix the other reasons share.
    expect(partialReasonMessage('missing-key')).toBe(
      'AI evaluation skipped: no API key was entered, so only the automated audit results are shown.',
    )
    expect(partialReasonMessage('missing-key').startsWith(AI_SKIP_REASON_PREFIX)).toBe(true)
    expect(partialReasonMessage('missing-key')).not.toContain(PARTIAL_REASON_PREFIX)
  })

  it('keeps the failure framing for rate-limit / parse-failure', () => {
    expect(partialReasonMessage('rate-limit').startsWith(PARTIAL_REASON_PREFIX)).toBe(true)
    expect(partialReasonMessage('rate-limit')).toContain('API usage limit was exceeded')
    expect(partialReasonMessage('parse-failure').startsWith(PARTIAL_REASON_PREFIX)).toBe(true)
    expect(partialReasonMessage('parse-failure')).toContain(
      'AI response could not be interpreted',
    )
  })

  it('frames each new taxonomy reason as a distinct failure line', () => {
    const distinct: Array<[AiFailureReason, string]> = [
      ['model-error', 'the selected model could not be used'],
      ['vision-unsupported', 'does not support image input'],
      ['workspace-required', 'no workspace ID was provided'],
      ['request-error', 'rejected as malformed'],
      ['ai-network', 'could not be reached'],
      ['provider-error', 'server error'],
    ]
    const seen = new Set<string>()
    for (const [reason, fragment] of distinct) {
      const message = partialReasonMessage(reason)
      expect(message.startsWith(PARTIAL_REASON_PREFIX)).toBe(true)
      expect(message).toContain(fragment)
      expect(seen.has(message)).toBe(false)
      seen.add(message)
    }
  })
})

describe('isAiSkip', () => {
  it('marks only missing-key as a deliberate skip', () => {
    expect(isAiSkip('missing-key')).toBe(true)
    expect(isAiSkip('invalid-key')).toBe(false)
    expect(isAiSkip('rate-limit')).toBe(false)
    expect(isAiSkip('parse-failure')).toBe(false)
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
    'model-error',
    'vision-unsupported',
    'workspace-required',
    'request-error',
    'ai-network',
    'provider-error',
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

  it('tells the user to confirm a console-issued API key (sk-ant-api…), not a Claude Code token', () => {
    // Grain-2: the 401 failure detail mirrors the grain-1 pre-block guidance so
    // both surfaces point the user at the console-issued key and name the Claude
    // Code token as the likely wrong credential.
    const detail = aiFailureDetail('invalid-key')
    expect(detail).toContain('console.anthropic.com → API Keys')
    expect(detail).toContain('sk-ant-api…')
    expect(detail).toContain('Claude Code token')
  })

  it('gives each new taxonomy reason a distinct, actionable "what to check next" detail', () => {
    // model-error → model permission / different model; vision-unsupported →
    // vision-capable model; request-error → retry / other model; ai-network and
    // provider-error → retry later.
    expect(aiFailureDetail('model-error')).toContain('model')
    expect(aiFailureDetail('model-error')).toContain('permission')
    expect(aiFailureDetail('vision-unsupported')).toContain('image')
    expect(aiFailureDetail('vision-unsupported')).toContain('vision-capable model')
    expect(aiFailureDetail('request-error')).toContain('again')
    expect(aiFailureDetail('ai-network')).toContain('try again')
    expect(aiFailureDetail('provider-error')).toContain('provider side')

    const details = REASONS.map((r) => aiFailureDetail(r))
    expect(new Set(details).size).toBe(REASONS.length)
  })

  it('guides the workspace-required key to find and enter its Workspace ID', () => {
    // The identity-linked / workspace-scoped 400 gets its own actionable detail:
    // name the credential type and point at the Console → Settings → Workspaces
    // lookup path so the user can supply the missing workspace id.
    const detail = aiFailureDetail('workspace-required')
    expect(detail).toContain('identity-linked key')
    expect(detail).toContain('Workspace ID')
    expect(detail).toContain('Console → Settings → Workspaces')
  })
})
