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
  SCREENSHOTS_OMITTED_NOTICE,
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
    expect(md).toContain('- Total score: 84 / 100')
    expect(md).toContain('- Grade: Good')
  })

  it('includes the audit and AI score breakdown', () => {
    expect(md).toContain('- Auto-audit: 50/60')
    expect(md).toContain('- AI rubric: 34/40')
  })

  it('includes every category with its score and each check + tip', () => {
    expect(md).toContain('### SEO (11/12)')
    // A failing check's message and its English tip are both present.
    expect(md).toContain('[Fail] Image optimization — The hero image is excessively large at 2.4MB.')
    expect(md).toContain('  - Tip: Convert to WebP and compress under 200KB to shorten initial load.')
  })

  it('orders checks fail-first within a category', () => {
    const perfHeading = md.indexOf('### Performance')
    const failIdx = md.indexOf('[Fail] Image optimization', perfHeading)
    const warnIdx = md.indexOf('[Warning] Render-blocking resources', perfHeading)
    const passIdx = md.indexOf('[Pass] Text compression', perfHeading)
    expect(failIdx).toBeGreaterThan(-1)
    expect(failIdx).toBeLessThan(warnIdx)
    expect(warnIdx).toBeLessThan(passIdx)
  })

  it('includes the AI axes with comments and suggestions', () => {
    expect(md).toContain('### Visual (15/16)')
    expect(md).toContain('- Suggestion: Raise the contrast in the hero area a little more to focus attention.')
  })

  it('does not render the partial-result guidance notice', () => {
    expect(md).not.toContain(PARTIAL_REPORT_NOTICE)
    expect(md).not.toContain('Partial result notice')
  })
})

describe('buildReportMarkdown — done-partial (60-point scale)', () => {
  const md = buildReportMarkdown(donePartialReport)

  it('states the 60-point scale on the total and holds the grade', () => {
    expect(md).toContain('- Total score: 50 / 60 (out of 60, auto-audit only)')
    expect(md).toContain('- Grade: Grade withheld')
  })

  it('renders an explicit standalone partial-result guidance notice near the top', () => {
    // The dedicated notice block is present, above the score summary section.
    expect(md).toContain('> **Partial result notice**')
    expect(md).toContain(`> ${PARTIAL_REPORT_NOTICE}`)
    expect(md.indexOf('Partial result notice')).toBeLessThan(md.indexOf('## Score summary'))
    // It reuses the same partialReason the screen shows.
    expect(md).toContain('> No AI evaluation results: an API key error means only the auto-audit results are shown.')
  })

  it('marks the AI rubric unavailable and prints the drop reason instead of axes', () => {
    expect(md).toContain('- AI rubric: unavailable')
    expect(md).toContain(
      'No AI evaluation results: an API key error means only the auto-audit results are shown.',
    )
    expect(md).not.toContain('### Visual')
  })

  it('still includes the auto-audit categories and checks', () => {
    expect(md).toContain('### SEO (11/12)')
    expect(md).toContain('[Pass] Page title')
  })
})

describe('buildReportMarkdown — partial-result detail', () => {
  const DETAIL =
    'The API key you entered was rejected by the provider. Check that the key value is correct and that you have permission to use the selected model, then run the diagnosis again.'
  const md = buildReportMarkdown({ ...donePartialReport, partialDetail: DETAIL })

  it('carries the detailed failure reason in the guidance block and score summary', () => {
    // In the top guidance blockquote…
    expect(md).toContain(`> ${DETAIL}`)
    // …and as an explicit summary line.
    expect(md).toContain(`- Partial result detail: ${DETAIL}`)
  })

  it('omits the detail line entirely when no partialDetail is present', () => {
    const plain = buildReportMarkdown(donePartialReport)
    expect(plain).not.toContain('Partial result detail')
  })
})

describe('buildReportMarkdown — evaluated without screenshots', () => {
  it('renders the notice in the AI evaluation section when screenshots were omitted', () => {
    const md = buildReportMarkdown({ ...doneReport, screenshotsOmitted: true })
    expect(md).toContain(SCREENSHOTS_OMITTED_NOTICE)
    // The notice sits inside the AI evaluation section, before the axes.
    const aiHeading = md.indexOf('## AI evaluation')
    const noticeIdx = md.indexOf(SCREENSHOTS_OMITTED_NOTICE)
    const firstAxis = md.indexOf('### Visual')
    expect(noticeIdx).toBeGreaterThan(aiHeading)
    expect(noticeIdx).toBeLessThan(firstAxis)
    // The axes are still scored (a text-only evaluation still succeeded).
    expect(md).toContain('### Visual (15/16)')
  })

  it('omits the notice on a normal report that used the screenshots', () => {
    expect(buildReportMarkdown(doneReport)).not.toContain(SCREENSHOTS_OMITTED_NOTICE)
  })
})

describe('buildReportMarkdown — provider status + masked summary', () => {
  it('prints the provider status code and masked summary lines on a partial report', () => {
    const md = buildReportMarkdown({
      ...donePartialReport,
      partialStatusCode: 404,
      partialSummary: 'HTTP 404: model claude-does-not-exist not found',
    })
    expect(md).toContain('- Provider status code: 404')
    expect(md).toContain('- Provider response: HTTP 404: model claude-does-not-exist not found')
  })

  it('omits both provider lines when the failure carried no status/summary', () => {
    const md = buildReportMarkdown(donePartialReport)
    expect(md).not.toContain('Provider status code')
    expect(md).not.toContain('Provider response')
  })

  it('never emits a raw API key — only the already-masked summary reaches the file', () => {
    const secret = 'sk-super-secret-value-abc123'
    const md = buildReportMarkdown({
      ...donePartialReport,
      partialStatusCode: 401,
      partialSummary: 'HTTP 401: authentication failed for [redacted]',
    })
    expect(md).not.toContain(secret)
    expect(md).toContain('- Provider status code: 401')
  })
})
