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
        label: '페이지 타이틀',
        status: 'pass',
        message: '고유한 타이틀 태그가 설정되어 있습니다.',
      },
      {
        id: 'seo-meta-description',
        label: '메타 설명',
        status: 'warn',
        message: '메타 설명이 다소 짧습니다.',
        tip: '핵심 가치를 담아 150~160자로 작성하세요.',
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
        label: '이미지 최적화',
        status: 'fail',
        message: '히어로 이미지가 과도하게 큽니다.',
        tip: 'WebP로 변환해 200KB 이하로 압축하세요.',
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
        label: '뷰포트 메타',
        status: 'pass',
        message: '반응형 뷰포트 메타 태그가 설정되어 있습니다.',
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
        message: '페이지가 HTTPS로 제공됩니다.',
      },
      {
        id: 'sec-canonical',
        label: '캐노니컬 URL',
        status: 'skip',
        message: '단일 페이지로 판단 대상이 아닙니다.',
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
        label: '이미지 대체 텍스트',
        status: 'warn',
        message: '대체 텍스트가 없는 이미지가 있습니다.',
        tip: '의미 있는 alt 텍스트를 추가하세요.',
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
    comment: '여백과 타이포그래피의 위계가 명확합니다.',
    suggestions: ['히어로 영역의 대비를 조금 더 높이세요.'],
  },
  {
    id: 'copy',
    label: LLM_AXIS_LABELS.copy,
    score: 11,
    maxScore: 14,
    comment: '핵심 가치는 전달되나 문구가 다소 추상적입니다.',
    suggestions: ['헤드라인에 구체적 수치를 넣어 신뢰를 높이세요.'],
  },
  {
    id: 'cta',
    label: LLM_AXIS_LABELS.cta,
    score: 8,
    maxScore: 10,
    comment: '주요 CTA는 명확하나 하단 반복 노출이 부족합니다.',
    suggestions: ['스크롤 하단에도 동일한 CTA를 배치하세요.'],
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
 * (`pending`), and `partialReason` explains why in Korean.
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
  partialReason: 'AI 평가 결과 없음: API 키 오류로 자동 점검 결과만 표시합니다.',
}

/** `error-load` — the page never loaded, so only the Korean message is shown. */
export const demoErrorLoadReport: LoadErrorReport = {
  outcome: 'error-load',
  url: 'http://127.0.0.1:3000',
  message: '페이지를 불러오지 못했습니다: 사설 네트워크 주소는 차단됩니다.',
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
