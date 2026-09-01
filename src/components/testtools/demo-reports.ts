/**
 * Demo report data for the test-tools stage simulator.
 *
 * The grader has no real `/api/analyze` yet (out of scope for this grain), so
 * when the simulator forces a terminal stage the report block needs *something*
 * to render. This module supplies compact, hand-authored sample reports for each
 * terminal outcome and maps a {@link Stage} onto the matching one.
 *
 * These are deliberately kept out of `core/__fixtures__/` (which production must
 * never import): the test-tools panel is itself mockup scaffolding that ships
 * only to exercise the wiring, so its demo data lives beside it rather than
 * reaching into the test fixtures. The shapes still satisfy the real
 * {@link ReportResult} contract so the same {@link module:components/ReportView}
 * renders them.
 *
 * Boundary: data module. It imports only report-domain types/constants from the
 * core layer and holds no state.
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
  type ReportResult,
  type Screenshot,
} from '../../core/report'
import type { Stage } from '../../state/stage'

/**
 * A 1×1 transparent PNG data URI. The demo screenshots only need to be a valid,
 * self-contained image source; the real pipeline substitutes actual captures.
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

/** Five auto-audit categories with a representative mix of check statuses. */
const demoCategories: AuditCategory[] = [
  {
    id: 'seo',
    label: AUDIT_CATEGORY_LABELS.seo,
    score: 10,
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
        message: 'The meta description is a little short.',
        tip: 'Write 150–160 characters that convey the core value.',
      },
    ],
  },
  {
    id: 'performance',
    label: AUDIT_CATEGORY_LABELS.performance,
    score: 8,
    maxScore: 12,
    checks: [
      {
        id: 'perf-image-size',
        label: 'Image optimization',
        status: 'fail',
        message: 'The hero image is excessively large.',
        tip: 'Convert it to WebP and compress it under 200KB.',
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
    ],
  },
  {
    id: 'security',
    label: AUDIT_CATEGORY_LABELS.security,
    score: 9,
    maxScore: 12,
    checks: [
      {
        id: 'sec-https',
        label: 'HTTPS',
        status: 'pass',
        message: 'The page is served over HTTPS.',
      },
      {
        id: 'sec-canonical',
        label: 'Canonical URL',
        status: 'skip',
        message: 'Not applicable for a single page.',
      },
    ],
  },
  {
    id: 'accessibility',
    label: AUDIT_CATEGORY_LABELS.accessibility,
    score: 11,
    maxScore: 12,
    checks: [
      {
        id: 'a11y-alt-text',
        label: 'Image alt text',
        status: 'warn',
        message: 'Some images have no alt text.',
        tip: 'Add meaningful alt text.',
      },
    ],
  },
]

/** The three AI-rubric axes with comments and suggestions. */
const demoLlmAxes: LlmAxis[] = [
  {
    id: 'visual',
    label: LLM_AXIS_LABELS.visual,
    score: 15,
    maxScore: 16,
    comment: 'The whitespace and typographic hierarchy are clear.',
    suggestions: ['Raise the contrast in the hero area a little more.'],
  },
  {
    id: 'copy',
    label: LLM_AXIS_LABELS.copy,
    score: 11,
    maxScore: 14,
    comment: 'The core value comes across, but the wording is a little abstract.',
    suggestions: ['Add concrete numbers to the headline to build trust.'],
  },
  {
    id: 'cta',
    label: LLM_AXIS_LABELS.cta,
    score: 8,
    maxScore: 10,
    comment: 'The primary CTA is clear, but it is not repeated enough toward the bottom.',
    suggestions: ['Place the same CTA at the bottom of the scroll as well.'],
  },
]

/** `done` — full 100-point report (auto-audit + AI rubric). */
export const demoDoneReport: AnalysisReport = {
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
  categories: demoCategories,
  llmAxes: demoLlmAxes,
  screenshots: [desktopShot, mobileShot],
}

/**
 * `done-partial` — the AI step failed, so the report completes on the 60-point
 * auto-audit scale only: `llmAxes`/`llmScore` are `null`, the grade is held
 * (`pending`), and `partialReason` explains why.
 */
export const demoDonePartialReport: AnalysisReport = {
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
  categories: demoCategories,
  llmAxes: null,
  screenshots: [desktopShot, mobileShot],
  partialReason:
    'AI evaluation unavailable: an API key error occurred, so only the automated audit results are shown.',
  partialDetail:
    'The API key you entered was rejected by the provider. Check that the key value is correct and that you have permission to use the selected model, then run the diagnosis again.',
}

/** `error-load` — the page never loaded, so only the message is shown. */
export const demoErrorLoadReport: LoadErrorReport = {
  outcome: 'error-load',
  url: 'http://127.0.0.1:3000',
  message: 'Failed to load the page: Private network addresses are blocked.',
  detail:
    'Private network, localhost, and link-local addresses are blocked to protect against SSRF. Enter a public URL that is reachable from outside.',
  statusCode: 400,
}

/**
 * The demo report to show for `stage`. Terminal stages map onto their matching
 * outcome; every non-terminal stage (idle / load / audit / ai) has no result
 * yet and returns `null` so {@link module:components/ReportView} renders nothing.
 */
export function demoReportFor(stage: Stage): ReportResult | null {
  switch (stage) {
    case 'done':
      return demoDoneReport
    case 'done-partial':
      return demoDonePartialReport
    case 'error-load':
      return demoErrorLoadReport
    default:
      return null
  }
}
