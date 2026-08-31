import { describe, expect, it } from 'vitest'
import { runAudit } from './audit-stage'
import { AUDIT_CATEGORY_IDS, AUDIT_MAX_SCORE, CheckItem } from '../core/report'

/**
 * The audit stage scores the 22-check registry into the five 60-point
 * categories. These tests confirm it produces all five canonical categories
 * summing to the 60-point max, that a fully clean page earns full marks, that a
 * bare/insecure page is penalised, and — critically — that `skip` checks are
 * normalised out of a category's denominator rather than counted as failures.
 */

/** Passes every applicable registry check across all five categories → 60/60. */
const CLEAN_HTML = `<!doctype html>
<html lang="ko">
<head>
  <title>훌륭한 랜딩 페이지 예시입니다</title>
  <meta name="description" content="아주 좋은 페이지 설명입니다">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:title" content="공유 타이틀">
  <meta property="og:image" content="https://example.com/og.png">
  <style>@media (max-width: 600px) { body { color: black } }</style>
</head>
<body>
  <h1>대표 제목</h1>
  <img src="https://example.com/a.png" alt="설명" loading="lazy">
</body>
</html>`

function check(checks: CheckItem[], id: string): CheckItem {
  const found = checks.find((c) => c.id === id)
  if (!found) throw new Error(`check ${id} not found`)
  return found
}

describe('runAudit', () => {
  it('returns the five canonical categories summing to the 60-point max', () => {
    const result = runAudit(CLEAN_HTML, 'https://example.com/')
    expect(result.categories.map((c) => c.id)).toEqual([...AUDIT_CATEGORY_IDS])
    expect(result.auditMax).toBe(AUDIT_MAX_SCORE)
    const maxSum = result.categories.reduce((s, c) => s + c.maxScore, 0)
    expect(maxSum).toBe(AUDIT_MAX_SCORE)
  })

  it('scores a fully clean HTTPS page at full marks', () => {
    const result = runAudit(CLEAN_HTML, 'https://example.com/')
    expect(result.auditScore).toBe(AUDIT_MAX_SCORE)
    for (const category of result.categories) {
      expect(category.score).toBe(category.maxScore)
    }
  })

  it('penalises a bare page missing title/viewport/lang and served over http', () => {
    const result = runAudit(
      '<html><head></head><body></body></html>',
      'http://example.com/',
    )
    expect(result.auditScore).toBeLessThan(AUDIT_MAX_SCORE)

    const seo = result.categories.find((c) => c.id === 'seo')!
    expect(check(seo.checks, 'seo-title').status).toBe('fail')

    const security = result.categories.find((c) => c.id === 'security')!
    expect(check(security.checks, 'security-https').status).toBe('fail')
  })

  it('excludes skip checks from a category denominator (skip ≠ fail)', () => {
    // Bare http page: security-https fails, inline-handlers passes, but
    // mixed-content and external-link-safety both skip (no HTTPS, no blank
    // links). Only the two non-skip checks count: 1 pass of 2 → half of 12.
    const result = runAudit(
      '<html><head></head><body></body></html>',
      'http://example.com/',
    )
    const security = result.categories.find((c) => c.id === 'security')!
    expect(check(security.checks, 'security-mixed-content').status).toBe('skip')
    expect(check(security.checks, 'security-external-link-safety').status).toBe(
      'skip',
    )
    // Half marks (6/12) — skips excluded. Were skips counted as fails it would
    // be 1/4 → 3.
    expect(security.score).toBe(security.maxScore / 2)
  })

  it('skips the image-alt check when the page has no images', () => {
    const result = runAudit('<html lang="ko"><title>x</title></html>', 'https://x.io/')
    const a11y = result.categories.find((c) => c.id === 'accessibility')!
    expect(check(a11y.checks, 'a11y-img-alt').status).toBe('skip')
  })

  it('warns on images missing alt text', () => {
    const html = '<html lang="ko"><title>x</title><body><img src="a.png"></body></html>'
    const result = runAudit(html, 'https://x.io/')
    const a11y = result.categories.find((c) => c.id === 'accessibility')!
    expect(check(a11y.checks, 'a11y-img-alt').status).toBe('warn')
  })
})
