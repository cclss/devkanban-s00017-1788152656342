import { describe, expect, it } from 'vitest'
import {
  isStageEvent,
  parseEvent,
  resultEvent,
  serializeEvent,
  stageEvent,
} from './stage-events'
import type { LoadErrorReport } from '../core/report'

/**
 * The NDJSON envelope is the shared client/server contract. These tests pin the
 * round-trip (`serialize` → `parse`), the newline framing, and the loud-failure
 * behaviour of a corrupt line.
 */

const errorReport: LoadErrorReport = {
  outcome: 'error-load',
  url: 'http://127.0.0.1/',
  message: '페이지를 불러오지 못했습니다: 사설 네트워크 주소는 차단됩니다.',
}

describe('serializeEvent / parseEvent', () => {
  it('round-trips a stage event', () => {
    const line = serializeEvent(stageEvent('audit'))
    expect(line.endsWith('\n')).toBe(true)
    expect(parseEvent(line)).toEqual({ type: 'stage', stage: 'audit' })
  })

  it('round-trips a result event', () => {
    const line = serializeEvent(resultEvent(errorReport))
    expect(parseEvent(line)).toEqual({ type: 'result', result: errorReport })
  })

  it('tolerates surrounding whitespace on parse', () => {
    expect(parseEvent('  {"type":"stage","stage":"load"}  ')).toEqual({
      type: 'stage',
      stage: 'load',
    })
  })
})

describe('parseEvent — failure', () => {
  it('throws on a blank line', () => {
    expect(() => parseEvent('   ')).toThrow(/empty/)
  })

  it('throws on non-JSON', () => {
    expect(() => parseEvent('not json')).toThrow(/invalid NDJSON/)
  })

  it('throws on an unrecognised shape', () => {
    expect(() => parseEvent('{"type":"other"}')).toThrow(/unrecognised/)
  })
})

describe('isStageEvent', () => {
  it('accepts well-formed events', () => {
    expect(isStageEvent({ type: 'stage', stage: 'done' })).toBe(true)
    expect(isStageEvent({ type: 'result', result: errorReport })).toBe(true)
  })

  it('rejects malformed values', () => {
    expect(isStageEvent(null)).toBe(false)
    expect(isStageEvent({ type: 'stage' })).toBe(false)
    expect(isStageEvent({ type: 'result', result: null })).toBe(false)
    expect(isStageEvent('stage')).toBe(false)
  })
})
