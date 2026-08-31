import { describe, expect, it } from 'vitest'
import { runAudit } from './audit-stage'
import { AUDIT_CATEGORY_IDS, AUDIT_MAX_SCORE } from '../core/report'

/**
 * The audit stage runs minimal *real* HTML checks. These tests confirm it
 * produces all five categories, that genuine signal moves the score (a clean
 * page scores high, an empty page scores low), and that inapplicable checks are
 * skipped rather than penalised.
 */

const GOOD_HTML = `<!doctype html><html lang="ko"><head>
  <title>좋은 랜딩 페이지</title>
  <meta name="description" content="설명입니다">
  <meta name="viewport" content="width=device-width">
</head><body><img src="a.png" alt="설명"></body></html>`

describe('runAudit', () => {
  it('returns the five canonical categories with the 60-point max', () => {
    const result = runAudit(GOOD_HTML, 'https://example.com/')
    expect(result.categories.map((c) => c.id)).toEqual([...AUDIT_CATEGORY_IDS])
    expect(result.auditMax).toBe(AUDIT_MAX_SCORE)
    const maxSum = result.categories.reduce((s, c) => s + c.maxScore, 0)
    expect(maxSum).toBe(AUDIT_MAX_SCORE)
  })

  it('scores a clean HTTPS page at or near full marks', () => {
    const result = runAudit(GOOD_HTML, 'https://example.com/')
    expect(result.auditScore).toBe(AUDIT_MAX_SCORE)
  })

  it('penalises a bare page missing title/viewport/lang and served over http', () => {
    const result = runAudit('<html><head></head><body></body></html>', 'http://example.com/')
    expect(result.auditScore).toBeLessThan(AUDIT_MAX_SCORE)

    const seo = result.categories.find((c) => c.id === 'seo')!
    expect(seo.checks.find((c) => c.id === 'seo-title')!.status).toBe('fail')

    const security = result.categories.find((c) => c.id === 'security')!
    expect(security.checks[0].status).toBe('fail')
  })

  it('skips the image-alt check when the page has no images', () => {
    const result = runAudit('<html lang="ko"><title>x</title></html>', 'https://x.io/')
    const a11y = result.categories.find((c) => c.id === 'accessibility')!
    expect(a11y.checks.find((c) => c.id === 'a11y-img-alt')!.status).toBe('skip')
  })

  it('warns on images missing alt text', () => {
    const html = '<html lang="ko"><title>x</title><body><img src="a.png"></body></html>'
    const result = runAudit(html, 'https://x.io/')
    const a11y = result.categories.find((c) => c.id === 'accessibility')!
    expect(a11y.checks.find((c) => c.id === 'a11y-img-alt')!.status).toBe('warn')
  })
})
