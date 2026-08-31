/**
 * Unit tests for the pure markdown exporter (grain-6). React-free, so they run
 * in the fast `node` environment.
 *
 * Covers the download-name shape (Validation SC-2), the full-report markdown
 * (total / grade / category scores / fail-first checks + tips / AI axes), and
 * the `done-partial` variant (60-point scale note + AI-drop reason instead of
 * axes) that SC-3 requires the downloaded file to reflect.
 */
import { describe, expect, it } from 'vitest'
import {
  doneReport,
  donePartialReport,
} from '../core/__fixtures__/report-fixtures'
import {
  PARTIAL_REPORT_NOTICE,
  buildReportFilename,
  buildReportMarkdown,
} from './report-markdown'

describe('buildReportFilename', () => {
  it('builds landing-report-<host>-<timestamp>.md from the report URL and time', () => {
    expect(buildReportFilename(doneReport)).toBe(
      'landing-report-example.com-2026-08-31T090000.md',
    )
  })

  it('sanitizes an unparseable URL to a safe host segment', () => {
    const broken = { ...doneReport, url: '::not a url::' }
    const name = buildReportFilename(broken)
    expect(name.startsWith('landing-report-unknown-host-')).toBe(true)
    expect(name.endsWith('.md')).toBe(true)
  })
})

describe('buildReportMarkdown — done (full report)', () => {
  const md = buildReportMarkdown(doneReport)

  it('includes the total on the 100-point scale and the grade label', () => {
    expect(md).toContain('- 총점: 84 / 100')
    expect(md).toContain('- 등급: 양호')
  })

  it('includes the audit and AI score breakdown', () => {
    expect(md).toContain('- 자동 점검: 50/60')
    expect(md).toContain('- AI 루브릭: 34/40')
  })

  it('includes every category with its score and each check + tip', () => {
    expect(md).toContain('### SEO (11/12)')
    // A failing check's message and its Korean tip are both present.
    expect(md).toContain('[실패] 이미지 최적화 — 히어로 이미지가 2.4MB로 과도하게 큽니다.')
    expect(md).toContain('  - 팁: WebP로 변환하고 200KB 이하로 압축해 초기 로딩을 단축하세요.')
  })

  it('orders checks fail-first within a category', () => {
    const perfHeading = md.indexOf('### 성능')
    const failIdx = md.indexOf('[실패] 이미지 최적화', perfHeading)
    const warnIdx = md.indexOf('[경고] 렌더 차단 리소스', perfHeading)
    const passIdx = md.indexOf('[통과] 텍스트 압축', perfHeading)
    expect(failIdx).toBeGreaterThan(-1)
    expect(failIdx).toBeLessThan(warnIdx)
    expect(warnIdx).toBeLessThan(passIdx)
  })

  it('includes the AI axes with comments and suggestions', () => {
    expect(md).toContain('### 비주얼 (15/16)')
    expect(md).toContain('- 제안: 히어로 영역의 대비를 조금 더 높여 시선을 집중시키세요.')
  })

  it('does not render the partial-result guidance notice', () => {
    expect(md).not.toContain(PARTIAL_REPORT_NOTICE)
    expect(md).not.toContain('부분 결과 안내')
  })
})

describe('buildReportMarkdown — done-partial (60-point scale)', () => {
  const md = buildReportMarkdown(donePartialReport)

  it('states the 60-point scale on the total and holds the grade', () => {
    expect(md).toContain('- 총점: 50 / 60 (자동 점검 60점 만점 기준)')
    expect(md).toContain('- 등급: 등급 보류')
  })

  it('renders an explicit standalone partial-result guidance notice near the top', () => {
    // The dedicated notice block is present, above the score summary section.
    expect(md).toContain('> **부분 결과 안내**')
    expect(md).toContain(`> ${PARTIAL_REPORT_NOTICE}`)
    expect(md.indexOf('부분 결과 안내')).toBeLessThan(md.indexOf('## 점수 요약'))
    // It reuses the same partialReason the screen shows.
    expect(md).toContain('> AI 평가 결과 없음: API 키 오류로 자동 점검 결과만 표시합니다.')
  })

  it('marks the AI rubric unavailable and prints the drop reason instead of axes', () => {
    expect(md).toContain('- AI 루브릭: 평가 불가')
    expect(md).toContain(
      'AI 평가 결과 없음: API 키 오류로 자동 점검 결과만 표시합니다.',
    )
    expect(md).not.toContain('### 비주얼')
  })

  it('still includes the auto-audit categories and checks', () => {
    expect(md).toContain('### SEO (11/12)')
    expect(md).toContain('[통과] 페이지 타이틀')
  })
})
