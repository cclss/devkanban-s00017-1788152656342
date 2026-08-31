import { describe, expect, it } from 'vitest'
import { loadErrorMessage, partialReasonMessage } from './analysis-copy'

/**
 * The Korean load-error / partial copy is the user-facing failure surface. These
 * tests pin the exact confirmed strings (mirroring the report demo copy in the
 * design spec) so a wording drift is caught here, not in the UI.
 */

describe('loadErrorMessage', () => {
  it('renders the confirmed private-address message', () => {
    expect(loadErrorMessage('private-address')).toBe(
      '페이지를 불러오지 못했습니다: 사설 네트워크 주소는 차단됩니다.',
    )
  })

  it('shares the private-address copy for blocked localhost', () => {
    expect(loadErrorMessage('blocked-host')).toBe(
      '페이지를 불러오지 못했습니다: 사설 네트워크 주소는 차단됩니다.',
    )
  })

  it('renders timeout / network / invalid-url causes', () => {
    expect(loadErrorMessage('timeout')).toContain('응답 시간이 초과')
    expect(loadErrorMessage('network')).toContain('연결할 수 없습니다')
    expect(loadErrorMessage('invalid-url')).toContain('URL 형식')
  })

  it('appends the status code in parentheses when present', () => {
    expect(loadErrorMessage('http-error', 500)).toBe(
      '페이지를 불러오지 못했습니다: 서버가 오류 상태를 반환했습니다. (500)',
    )
  })
})

describe('partialReasonMessage', () => {
  it('matches the confirmed invalid-key partial copy', () => {
    expect(partialReasonMessage('invalid-key')).toBe(
      'AI 평가 결과 없음: API 키 오류로 자동 점검 결과만 표시합니다.',
    )
  })

  it('renders the missing-key / rate-limit / parse-failure variants', () => {
    expect(partialReasonMessage('missing-key')).toBe(
      'AI 평가 결과 없음: API 키가 없어 자동 점검 결과만 표시합니다.',
    )
    expect(partialReasonMessage('rate-limit')).toContain('API 사용 한도를 초과')
    expect(partialReasonMessage('parse-failure')).toContain('AI 응답을 해석하지 못해')
  })
})
