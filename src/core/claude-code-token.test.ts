import { describe, expect, it } from 'vitest'
import {
  CLAUDE_CODE_TOKEN_GUIDANCE,
  CLAUDE_CODE_TOKEN_PREFIX,
  isClaudeCodeToken,
} from './claude-code-token'

describe('isClaudeCodeToken', () => {
  it('detects a plain sk-ant-oat token', () => {
    expect(isClaudeCodeToken('sk-ant-oat01-abc123')).toBe(true)
  })

  it('detects the bare prefix', () => {
    expect(isClaudeCodeToken(CLAUDE_CODE_TOKEN_PREFIX)).toBe(true)
  })

  it('ignores surrounding whitespace', () => {
    expect(isClaudeCodeToken('  sk-ant-oat01-abc123  ')).toBe(true)
    expect(isClaudeCodeToken('\tsk-ant-oat\n')).toBe(true)
  })

  it('is case-insensitive on the prefix', () => {
    expect(isClaudeCodeToken('SK-ANT-OAT01-XYZ')).toBe(true)
    expect(isClaudeCodeToken('Sk-Ant-Oat01')).toBe(true)
  })

  it('does not flag a real Messages API key (sk-ant-api…)', () => {
    expect(isClaudeCodeToken('sk-ant-api03-abc123')).toBe(false)
  })

  it('does not flag an unrelated or blank value', () => {
    expect(isClaudeCodeToken('')).toBe(false)
    expect(isClaudeCodeToken('   ')).toBe(false)
    expect(isClaudeCodeToken('sk-keep-me')).toBe(false)
    expect(isClaudeCodeToken('my-oat-token')).toBe(false)
  })

  it('only matches the prefix at the start, not mid-string', () => {
    expect(isClaudeCodeToken('prefix-sk-ant-oat')).toBe(false)
  })
})

describe('CLAUDE_CODE_TOKEN_GUIDANCE', () => {
  it('names the credential difference and the real issuance path', () => {
    expect(CLAUDE_CODE_TOKEN_GUIDANCE).toContain('Claude Code')
    expect(CLAUDE_CODE_TOKEN_GUIDANCE).toContain('console.anthropic.com')
    expect(CLAUDE_CODE_TOKEN_GUIDANCE).toContain('API Keys')
    expect(CLAUDE_CODE_TOKEN_GUIDANCE).toContain('sk-ant-api')
  })
})
