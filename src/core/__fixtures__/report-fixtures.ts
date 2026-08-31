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
        label: '페이지 타이틀',
        status: 'pass',
        message: '고유한 타이틀 태그가 설정되어 있습니다.',
      },
      {
        id: 'seo-meta-description',
        label: '메타 설명',
        status: 'warn',
        message: '메타 설명이 120자로 다소 짧습니다.',
        tip: '검색 노출을 위해 150~160자 사이로 핵심 가치를 담아 작성하세요.',
      },
      {
        id: 'seo-og-image',
        label: '오픈그래프 이미지',
        status: 'pass',
        message: 'og:image가 올바르게 지정되어 있습니다.',
      },
      {
        id: 'seo-canonical',
        label: '캐노니컬 URL',
        status: 'skip',
        message: '단일 페이지로 캐노니컬 판단 대상이 아닙니다.',
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
        label: '이미지 최적화',
        status: 'fail',
        message: '히어로 이미지가 2.4MB로 과도하게 큽니다.',
        tip: 'WebP로 변환하고 200KB 이하로 압축해 초기 로딩을 단축하세요.',
      },
      {
        id: 'perf-render-blocking',
        label: '렌더 차단 리소스',
        status: 'warn',
        message: '헤드에 렌더를 차단하는 스크립트가 2개 있습니다.',
        tip: 'async 또는 defer 속성을 추가해 초기 렌더를 앞당기세요.',
      },
      {
        id: 'perf-compression',
        label: '텍스트 압축',
        status: 'pass',
        message: 'gzip 압축이 활성화되어 있습니다.',
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
      {
        id: 'mobile-tap-target',
        label: '터치 영역',
        status: 'pass',
        message: '주요 버튼의 터치 영역이 48px 이상입니다.',
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
        message: '페이지가 HTTPS로 제공됩니다.',
      },
      {
        id: 'sec-csp',
        label: '콘텐츠 보안 정책',
        status: 'fail',
        message: 'Content-Security-Policy 헤더가 없습니다.',
        tip: 'XSS 위험을 줄이기 위해 최소한의 CSP 헤더를 설정하세요.',
      },
      {
        id: 'sec-mixed-content',
        label: '혼합 콘텐츠',
        status: 'warn',
        message: 'HTTP로 로드되는 리소스가 1건 있습니다.',
        tip: '모든 외부 리소스를 HTTPS 경로로 교체하세요.',
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
        label: '이미지 대체 텍스트',
        status: 'warn',
        message: '대체 텍스트가 없는 이미지가 3개 있습니다.',
        tip: '스크린리더 사용자를 위해 의미 있는 alt 텍스트를 추가하세요.',
      },
      {
        id: 'a11y-contrast',
        label: '색 대비',
        status: 'pass',
        message: '본문 텍스트의 색 대비가 WCAG AA를 만족합니다.',
      },
      {
        id: 'a11y-labels',
        label: '폼 레이블',
        status: 'pass',
        message: '모든 입력 필드에 레이블이 연결되어 있습니다.',
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
    comment: '여백과 타이포그래피의 위계가 명확해 첫인상이 깔끔합니다.',
    suggestions: [
      '히어로 영역의 대비를 조금 더 높여 시선을 집중시키세요.',
      '섹션 간 여백을 통일해 리듬감을 강화하세요.',
    ],
  },
  {
    id: 'copy',
    label: LLM_AXIS_LABELS.copy,
    score: 11,
    maxScore: 14,
    comment: '핵심 가치는 전달되나 문구가 다소 추상적입니다.',
    suggestions: [
      '헤드라인에 구체적 수치나 결과를 넣어 신뢰를 높이세요.',
      '기능 나열보다 사용자 이점 중심으로 문장을 다듬으세요.',
    ],
  },
  {
    id: 'cta',
    label: LLM_AXIS_LABELS.cta,
    score: 8,
    maxScore: 10,
    comment: '주요 CTA가 명확하나 하단 반복 노출이 부족합니다.',
    suggestions: [
      '스크롤 하단에도 동일한 CTA를 한 번 더 배치하세요.',
      '버튼 문구를 행동 지향적으로("무료로 시작하기") 바꾸세요.',
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
 * held (`pending`), and `partialReason` explains why in Korean.
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
  partialReason: 'AI 평가 결과 없음: API 키 오류로 자동 점검 결과만 표시합니다.',
}

/**
 * `error-load` — the page never loaded (here: SSRF block), so no report is
 * produced; only the Korean message (and status code) is shown.
 */
export const errorLoadReport: LoadErrorReport = {
  outcome: 'error-load',
  url: 'http://127.0.0.1:3000',
  message: '페이지를 불러오지 못했습니다: 사설 네트워크 주소는 차단됩니다.',
  statusCode: 400,
}
