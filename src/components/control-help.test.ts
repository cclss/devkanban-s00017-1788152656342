/**
 * Contract tests for the grader control help copy ({@link module:components/control-help}).
 *
 * The copy is plain data, so these run in the fast `node` environment. They pin
 * the guarantee grain-2 relies on: every declared control key resolves to a
 * non-empty `{title, body}` entry, the key list and the record agree, and the copy
 * is not accidentally the legacy PDF-tool copy.
 */
import { describe, expect, it } from 'vitest'
import { CONTROL_HELP, CONTROL_HELP_KEYS, type ControlHelpKey } from './control-help'

describe('CONTROL_HELP copy', () => {
  it('lists every control key exactly once', () => {
    const unique = new Set(CONTROL_HELP_KEYS)
    expect(unique.size).toBe(CONTROL_HELP_KEYS.length)
  })

  it('has a record entry for every listed key and no extra keys', () => {
    const recordKeys = Object.keys(CONTROL_HELP).sort()
    const listKeys = [...CONTROL_HELP_KEYS].sort()
    expect(recordKeys).toEqual(listKeys)
  })

  it('gives every control a non-empty title and body', () => {
    for (const key of CONTROL_HELP_KEYS) {
      const entry = CONTROL_HELP[key as ControlHelpKey]
      expect(entry.title.trim().length, `title for ${key}`).toBeGreaterThan(0)
      expect(entry.body.trim().length, `body for ${key}`).toBeGreaterThan(0)
    }
  })

  it('names both credential types and each issuance path in the API-key help', () => {
    const body = CONTROL_HELP.apiKey.body
    // The usable Anthropic API key and its issuance path.
    expect(body).toContain('sk-ant-api…')
    expect(body).toContain('console.anthropic.com → API Keys')
    // The rejected Claude Code-only token and its issuance path.
    expect(body).toContain('sk-ant-oat…')
    expect(body).toContain('claude setup-token')
    expect(body).toContain('Claude Code-only token')
  })

  it('covers each distinct grader control called out in the grain', () => {
    const expected: readonly ControlHelpKey[] = [
      'urlInput',
      'startDiagnosis',
      'savedUrls',
      'provider',
      'model',
      'apiKey',
      'revealKey',
      'saveKey',
      'forceStage',
      'conflictSim',
      'markdownDownload',
      'screenshotTabs',
    ]
    for (const key of expected) {
      expect(CONTROL_HELP[key]).toBeDefined()
    }
  })
})
