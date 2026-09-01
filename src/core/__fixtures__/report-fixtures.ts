/**
 * Mock report fixtures for the three terminal outcomes the UI must render:
 * `done` (full 100-point report), `done-partial` (auto-audit-only 60-point
 * report), and `error-load` (no report, message only).
 *
 * These are hand-authored sample data — not the output of any scoring logic —
 * so the report view, markdown exporter, and state simulator can be built and
 * verified before the real `/api/analyze` pipeline exists. Kept under
 * `__fixtures__/` so production modules never import them.
 */

import {
  AUDIT_CATEGORY_LABELS,
  AUDIT_MAX_SCORE,
  LLM_AXIS_LABELS,
  LLM_MAX_SCORE,
  TOTAL_MAX_SCORE,
  type AnalysisReport,
  type AuditCategory,
  type LlmAxis,
  type LoadErrorReport,
  type Screenshot,
} from '../report'

/**
 * A 1×1 transparent PNG as a data URI. Screenshots in fixtures only need to be
 * a valid, self-contained image source; the real pipeline substitutes actual
 * captures. Using a constant keeps the fixture file small and byte-stable.
 */
const PLACEHOLDER_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

const desktopShot: Screenshot = {
  viewport: 'desktop',
  dataUrl: PLACEHOLDER_PNG,
  width: 1280,
  height: 720,
}

const mobileShot: Screenshot = {
  viewport: 'mobile',
  dataUrl: PLACEHOLDER_PNG,
  width: 390,
  height: 844,
}

/** The five auto-audit categories with a realistic mix of check statuses. */
const sampleCategories: AuditCategory[] = [
  {
    id: 'seo',
    label: AUDIT_CATEGORY_LABELS.seo,
    score: 11,
    maxScore: 12,
    checks: [
      {
        id: 'seo-title',
        label: 'Page title',
        status: 'pass',
        message: 'A unique title tag is set.',
      },
      {
        id: 'seo-meta-description',
        label: 'Meta description',
        status: 'warn',
        message: 'The meta description is somewhat short at 120 characters.',
        tip: 'Write 150–160 characters capturing the core value for better search visibility.',
      },
      {
        id: 'seo-og-image',
        label: 'Open Graph image',
        status: 'pass',
        message: 'og:image is set correctly.',
      },
      {
        id: 'seo-canonical',
        label: 'Canonical URL',
        status: 'skip',
        message: 'A single page, so a canonical URL is not applicable.',
      },
    ],
  },
  {
    id: 'performance',
    label: AUDIT_CATEGORY_LABELS.performance,
    score: 9,
    maxScore: 12,
    checks: [
      {
        id: 'perf-image-size',
        label: 'Image optimization',
        status: 'fail',
        message: 'The hero image is excessively large at 2.4MB.',
        tip: 'Convert to WebP and compress under 200KB to shorten initial load.',
      },
      {
        id: 'perf-render-blocking',
        label: 'Render-blocking resources',
        status: 'warn',
        message: 'There are 2 render-blocking scripts in the head.',
        tip: 'Add the async or defer attribute to speed up the initial render.',
      },
      {
        id: 'perf-compression',
        label: 'Text compression',
        status: 'pass',
        message: 'gzip compression is enabled.',
      },
    ],
  },
  {
    id: 'mobile',
    label: AUDIT_CATEGORY_LABELS.mobile,
    score: 12,
    maxScore: 12,
    checks: [
      {
        id: 'mobile-viewport',
        label: 'Viewport meta',
        status: 'pass',
        message: 'A responsive viewport meta tag is set.',
      },
      {
        id: 'mobile-tap-target',
        label: 'Tap targets',
        status: 'pass',
        message: 'The tap targets of primary buttons are at least 48px.',
      },
    ],
  },
  {
    id: 'security',
    label: AUDIT_CATEGORY_LABELS.security,
    score: 8,
    maxScore: 12,
    checks: [
      {
        id: 'sec-https',
        label: 'HTTPS',
        status: 'pass',
        message: 'The page is served over HTTPS.',
      },
      {
        id: 'sec-csp',
        label: 'Content Security Policy',
        status: 'fail',
        message: 'The Content-Security-Policy header is missing.',
        tip: 'Set a minimal CSP header to reduce XSS risk.',
      },
      {
        id: 'sec-mixed-content',
        label: 'Mixed content',
        status: 'warn',
        message: 'There is 1 resource loaded over HTTP.',
        tip: 'Replace all external resources with HTTPS paths.',
      },
    ],
  },
  {
    id: 'accessibility',
    label: AUDIT_CATEGORY_LABELS.accessibility,
    score: 10,
    maxScore: 12,
    checks: [
      {
        id: 'a11y-alt-text',
        label: 'Image alt text',
        status: 'warn',
        message: 'There are 3 images without alt text.',
        tip: 'Add meaningful alt text for screen-reader users.',
      },
      {
        id: 'a11y-contrast',
        label: 'Color contrast',
        status: 'pass',
        message: 'The body text color contrast meets WCAG AA.',
      },
      {
        id: 'a11y-labels',
        label: 'Form labels',
        status: 'pass',
        message: 'Every input field has an associated label.',
      },
    ],
  },
]

/** The three AI-rubric axes with comments and concrete suggestions. */
const sampleLlmAxes: LlmAxis[] = [
  {
    id: 'visual',
    label: LLM_AXIS_LABELS.visual,
    score: 15,
    maxScore: 16,
    comment: 'Whitespace and typographic hierarchy are clear, giving a clean first impression.',
    suggestions: [
      'Raise the contrast in the hero area a little more to focus attention.',
      'Unify the spacing between sections to strengthen the rhythm.',
    ],
  },
  {
    id: 'copy',
    label: LLM_AXIS_LABELS.copy,
    score: 11,
    maxScore: 14,
    comment: 'The core value comes across, but the wording is somewhat abstract.',
    suggestions: [
      'Add concrete numbers or results to the headline to build trust.',
      'Refine the copy around user benefits rather than listing features.',
    ],
  },
  {
    id: 'cta',
    label: LLM_AXIS_LABELS.cta,
    score: 8,
    maxScore: 10,
    comment: 'The primary CTA is clear, but it is not repeated enough toward the bottom.',
    suggestions: [
      'Place the same CTA once more at the bottom of the scroll.',
      'Change the button copy to be action-oriented (e.g. "Start for free").',
    ],
  },
]

/** `done` — full 100-point report with auto-audit + AI rubric. */
export const doneReport: AnalysisReport = {
  outcome: 'done',
  url: 'https://example.com/landing',
  analyzedAt: '2026-08-31T09:00:00.000Z',
  score: {
    total: 84,
    max: TOTAL_MAX_SCORE,
    grade: 'good',
    auditScore: 50,
    auditMax: AUDIT_MAX_SCORE,
    llmScore: 34,
    llmMax: LLM_MAX_SCORE,
  },
  categories: sampleCategories,
  llmAxes: sampleLlmAxes,
  screenshots: [desktopShot, mobileShot],
}

/**
 * `done-partial` — the AI step failed, so the report completes on the 60-point
 * auto-audit scale only: `llmAxes` is `null`, `llmScore` is `null`, the grade is
 * held (`pending`), and `partialReason` explains why in English.
 */
export const donePartialReport: AnalysisReport = {
  outcome: 'done-partial',
  url: 'https://example.com/landing',
  analyzedAt: '2026-08-31T09:01:00.000Z',
  score: {
    total: 50,
    max: AUDIT_MAX_SCORE,
    grade: 'pending',
    auditScore: 50,
    auditMax: AUDIT_MAX_SCORE,
    llmScore: null,
    llmMax: LLM_MAX_SCORE,
  },
  categories: sampleCategories,
  llmAxes: null,
  screenshots: [desktopShot, mobileShot],
  partialReason: 'No AI evaluation results: an API key error means only the auto-audit results are shown.',
}

/**
 * `error-load` — the page never loaded (here: SSRF block), so no report is
 * produced; only the English message (and status code) is shown.
 */
export const errorLoadReport: LoadErrorReport = {
  outcome: 'error-load',
  url: 'http://127.0.0.1:3000',
  message: 'Failed to load the page: private network addresses are blocked.',
  statusCode: 400,
}
