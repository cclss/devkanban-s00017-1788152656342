import { describe, expect, it } from 'vitest'
import { buildAuditContext } from './audit-context'
import {
  CHECK_COUNT,
  CHECK_REGISTRY,
  checksByCategory,
  evaluateAllChecks,
} from './check-registry'
import { AUDIT_CATEGORY_IDS, type AuditCategoryId, type CheckStatus } from '../core/report'

/**
 * The 22-check registry is the auto-audit's contract: exactly 22 declarative
 * checks, split 5/4/4/4/5 across the five categories, each a pure function of a
 * parsed context. These tests pin the shape of the registry and the status/skip
 * outcomes on a clean page versus a bare one.
 */

const CLEAN_HTML = `<!doctype html>
<html lang="ko">
<head>
  <title>좋은 랜딩 페이지 제목</title>
  <meta name="description" content="페이지 요약 설명입니다.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:title" content="공유 제목">
  <meta property="og:image" content="https://cdn.example.com/og.png">
  <style>@media (max-width: 600px) { body { font-size: 14px; } }</style>
</head>
<body>
  <h1>대표 제목</h1>
  <img src="https://cdn.example.com/a.png" alt="설명" loading="lazy">
  <label for="email">이메일</label>
  <input id="email" type="email">
</body>
</html>`

const BARE_HTML = '<html><head></head><body></body></html>'

const EXPECTED_PER_CATEGORY: Record<AuditCategoryId, number> = {
  seo: 5,
  performance: 4,
  mobile: 4,
  security: 4,
  accessibility: 5,
}

/** Maps `id → status` for a context, for terse per-check assertions. */
function statusMap(html: string, url: string): Record<string, CheckStatus> {
  const items = evaluateAllChecks(buildAuditContext(html, url))
  return Object.fromEntries(items.map((c) => [c.id, c.status]))
}

describe('CHECK_REGISTRY shape', () => {
  it('has exactly 22 checks', () => {
    expect(CHECK_REGISTRY).toHaveLength(22)
    expect(CHECK_COUNT).toBe(22)
  })

  it('splits 5/4/4/4/5 across the five canonical categories', () => {
    for (const id of AUDIT_CATEGORY_IDS) {
      const count = CHECK_REGISTRY.filter((c) => c.category === id).length
      expect(count, `category ${id}`).toBe(EXPECTED_PER_CATEGORY[id])
    }
    // Every check belongs to a canonical category (no strays).
    for (const check of CHECK_REGISTRY) {
      expect(AUDIT_CATEGORY_IDS).toContain(check.category)
    }
  })

  it('uses unique, kebab ids and non-empty Korean labels', () => {
    const ids = CHECK_REGISTRY.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const check of CHECK_REGISTRY) {
      expect(check.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(check.label.length).toBeGreaterThan(0)
    }
  })
})

describe('evaluate outcomes', () => {
  it('passes the applicable checks and skips the inapplicable ones on a clean page', () => {
    const status = statusMap(CLEAN_HTML, 'https://example.com/')

    // No check should fail on a clean, well-formed HTTPS page.
    expect(Object.values(status)).not.toContain('fail')

    // The two "not applicable here" checks skip rather than pass/fail.
    expect(status['security-external-link-safety']).toBe('skip') // no _blank links
    expect(status['security-mixed-content']).toBe('pass') // https, no http refs

    // Representative passes across every category.
    expect(status['seo-title']).toBe('pass')
    expect(status['perf-html-size']).toBe('pass')
    expect(status['mobile-viewport']).toBe('pass')
    expect(status['security-https']).toBe('pass')
    expect(status['a11y-html-lang']).toBe('pass')
    expect(status['a11y-img-alt']).toBe('pass')
    expect(status['a11y-form-labels']).toBe('pass')
  })

  it('fails/warns/skips appropriately on a bare http page', () => {
    const status = statusMap(BARE_HTML, 'http://example.com/')

    // Hard failures from missing essentials.
    expect(status['seo-title']).toBe('fail')
    expect(status['seo-meta-description']).toBe('fail')
    expect(status['seo-h1']).toBe('fail')
    expect(status['mobile-viewport']).toBe('fail')
    expect(status['security-https']).toBe('fail')
    expect(status['a11y-html-lang']).toBe('fail')
    expect(status['a11y-heading-structure']).toBe('fail')

    // Skips where the check cannot apply.
    expect(status['seo-title-length']).toBe('skip') // no title to measure
    expect(status['perf-image-lazyload']).toBe('skip') // no images
    expect(status['mobile-device-width']).toBe('skip') // no viewport
    expect(status['mobile-initial-scale']).toBe('skip')
    expect(status['security-mixed-content']).toBe('skip') // not https
    expect(status['security-external-link-safety']).toBe('skip')
    expect(status['a11y-img-alt']).toBe('skip')
    expect(status['a11y-form-labels']).toBe('skip')
    expect(status['a11y-zoom-enabled']).toBe('skip')

    // Non-blocking warnings.
    expect(status['seo-open-graph']).toBe('warn')
    expect(status['mobile-media-query']).toBe('warn')
  })

  it('warns on multiple h1 and a zoom-locked viewport', () => {
    const html =
      '<html lang="ko"><head><title>제목이 충분히 긴 페이지</title>' +
      '<meta name="viewport" content="width=device-width, user-scalable=no"></head>' +
      '<body><h1>A</h1><h1>B</h1></body></html>'
    const status = statusMap(html, 'https://x/')
    expect(status['seo-h1']).toBe('warn')
    expect(status['a11y-zoom-enabled']).toBe('fail')
  })

  it('flags mixed content and unsafe blank links as problems', () => {
    const html =
      '<html lang="ko"><head><title>혼합 콘텐츠 테스트 페이지</title></head><body>' +
      '<img src="http://insecure/a.png" alt="x">' +
      '<a href="https://e" target="_blank">위험</a></body></html>'
    const status = statusMap(html, 'https://secure/')
    expect(status['security-mixed-content']).toBe('fail')
    expect(status['security-external-link-safety']).toBe('warn')
  })

  it('attaches tips to actionable results and omits them on pass/skip', () => {
    const items = evaluateAllChecks(buildAuditContext(BARE_HTML, 'http://x/'))
    for (const item of items) {
      expect(item.message.length).toBeGreaterThan(0)
      if (item.status === 'fail' || item.status === 'warn') {
        expect(item.tip, `${item.id} tip`).toBeTruthy()
      } else {
        expect(item.tip, `${item.id} tip`).toBeUndefined()
      }
    }
  })
})

describe('checksByCategory', () => {
  it('groups all 22 checks under the five categories in order', () => {
    const grouped = checksByCategory(buildAuditContext(CLEAN_HTML, 'https://example.com/'))
    for (const id of AUDIT_CATEGORY_IDS) {
      expect(grouped[id]).toHaveLength(EXPECTED_PER_CATEGORY[id])
    }
    const total = AUDIT_CATEGORY_IDS.reduce((n, id) => n + grouped[id].length, 0)
    expect(total).toBe(22)
  })
})
