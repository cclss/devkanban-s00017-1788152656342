import { describe, expect, it } from 'vitest'
import { buildAuditContext } from './audit-context'

/**
 * `buildAuditContext` parses a page once into a flat fact bag. These tests pin
 * every extracted signal against known markup so the registry can trust the
 * context without re-parsing.
 */

const RICH_HTML = `<!doctype html>
<html lang="ko">
<head>
  <title>좋은 랜딩 페이지 제목</title>
  <meta name="description" content="설명입니다">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:title" content="공유 제목">
  <meta property="og:image" content="https://cdn.example.com/og.png">
  <style>@media (max-width: 600px) { body { font-size: 14px; } }</style>
  <script src="https://cdn.example.com/app.js"></script>
</head>
<body>
  <h1>대표 제목</h1>
  <h2>소제목</h2>
  <img src="https://cdn.example.com/a.png" alt="설명" loading="lazy">
  <img src="https://cdn.example.com/b.png" alt="설명2">
  <a href="https://ext.example.com" target="_blank" rel="noopener">외부</a>
  <a href="https://other.example.com" target="_blank">위험한 외부</a>
  <label for="email">이메일</label>
  <input id="email" type="email">
  <input type="text" aria-label="이름">
  <input type="hidden" name="csrf">
</body>
</html>`

describe('buildAuditContext', () => {
  it('reads transport facts from url and raw bytes', () => {
    const ctx = buildAuditContext(RICH_HTML, 'https://example.com/')
    expect(ctx.https).toBe(true)
    expect(ctx.htmlSize).toBe(Buffer.byteLength(RICH_HTML, 'utf8'))
    expect(buildAuditContext('', 'http://example.com/').https).toBe(false)
  })

  it('extracts lang, title and meta tags', () => {
    const ctx = buildAuditContext(RICH_HTML, 'https://example.com/')
    expect(ctx.lang).toBe('ko')
    expect(ctx.title).toBe('좋은 랜딩 페이지 제목')
    expect(ctx.meta.description).toBe('설명입니다')
    expect(ctx.meta.viewport).toBe('width=device-width, initial-scale=1')
    expect(ctx.meta.ogTitle).toBe('공유 제목')
    expect(ctx.meta.ogImage).toBe('https://cdn.example.com/og.png')
  })

  it('counts headings, images, links, inputs and scripts', () => {
    const ctx = buildAuditContext(RICH_HTML, 'https://example.com/')
    expect(ctx.headings.h1Count).toBe(1)
    expect(ctx.headings.totalCount).toBe(2)

    expect(ctx.images.total).toBe(2)
    expect(ctx.images.missingAlt).toBe(0)
    expect(ctx.images.lazyLoaded).toBe(1)

    expect(ctx.links.total).toBe(2)
    expect(ctx.links.blankTotal).toBe(2)
    expect(ctx.links.blankUnsafe).toBe(1)

    // hidden input is excluded; email (label-for) + text (aria-label) are labeled.
    expect(ctx.inputs.total).toBe(2)
    expect(ctx.inputs.unlabeled).toBe(0)

    expect(ctx.scripts.external).toBe(1)
  })

  it('flags media queries but no inline styles/handlers here', () => {
    const ctx = buildAuditContext(RICH_HTML, 'https://example.com/')
    expect(ctx.hasMediaQuery).toBe(true)
    expect(ctx.hasInlineEventHandlers).toBe(false)
    expect(ctx.inlineStyleCount).toBe(0)
    expect(ctx.mixedContentCount).toBe(0)
  })

  it('treats a bare document as all-absent', () => {
    const ctx = buildAuditContext('<html><head></head><body></body></html>', 'http://x/')
    expect(ctx.lang).toBeNull()
    expect(ctx.title).toBe('')
    expect(ctx.meta.description).toBeNull()
    expect(ctx.meta.viewport).toBeNull()
    expect(ctx.headings.totalCount).toBe(0)
    expect(ctx.images.total).toBe(0)
    expect(ctx.links.total).toBe(0)
    expect(ctx.inputs.total).toBe(0)
    expect(ctx.scripts.external).toBe(0)
  })

  it('detects inline styles, event handlers and unlabeled inputs', () => {
    const html =
      '<div style="color:red" onclick="go()"></div>' +
      '<span style="margin:0"></span>' +
      '<input type="text"><select></select>'
    const ctx = buildAuditContext(html, 'http://x/')
    expect(ctx.inlineStyleCount).toBe(2)
    expect(ctx.hasInlineEventHandlers).toBe(true)
    expect(ctx.inputs.total).toBe(2)
    expect(ctx.inputs.unlabeled).toBe(2)
  })

  it('counts mixed content only on https pages', () => {
    const html = '<img src="http://insecure.example.com/a.png"><link href="http://x/y.css">'
    expect(buildAuditContext(html, 'https://secure/').mixedContentCount).toBe(2)
    expect(buildAuditContext(html, 'http://plain/').mixedContentCount).toBe(0)
  })

  it('treats an empty alt as present but a missing alt as absent', () => {
    const ctx = buildAuditContext('<img src="a.png" alt=""><img src="b.png">', 'https://x/')
    expect(ctx.images.total).toBe(2)
    expect(ctx.images.missingAlt).toBe(1)
  })
})
