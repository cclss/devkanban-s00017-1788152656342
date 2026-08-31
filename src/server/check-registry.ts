/**
 * The 22-check auto-audit registry.
 *
 * A single declarative list of checks — five categories, worth 60 points
 * combined in a later scoring grain — where every check is a pure function of one
 * {@link AuditContext}. Each entry declares its stable `id`, its `category`, a
 * Korean `label`, and an `evaluate(ctx)` that returns a
 * {@link ../core/report#CheckStatus} plus Korean `message` and (for actionable
 * results) a `tip`. This module owns *what is checked and what the user is told*;
 * it does not fetch, score, or render — the pipeline feeds it a context and reads
 * the outcomes.
 *
 * Category split (22 total): SEO 5 / 성능 4 / 모바일 4 / 보안 4 / 접근성 5.
 *
 * `skip` is a first-class outcome: a check that cannot apply to this page (no
 * images to alt-check, no viewport to inspect, a non-HTTPS page for a mixed-
 * content check) returns `skip` and is normalised out of the denominator by the
 * scorer, rather than being counted as a pass or a fail.
 *
 * All Korean copy here is confirmed user-facing domain content (mirroring the
 * report labels), recorded in the design spec — it is not a design token.
 *
 * Boundary: standalone backend module reusing only `core/report` types and the
 * {@link AuditContext}. Pure functions throughout.
 */
import type {
  AuditCategoryId,
  CheckItem,
  CheckStatus,
} from '../core/report'
import type { AuditContext } from './audit-context'

/** The outcome of one check: a status plus Korean copy (and optional tip). */
export interface CheckResult {
  /** Pass / warn / fail, or `skip` when the check does not apply. */
  status: CheckStatus
  /** Korean one-line explanation of the result. */
  message: string
  /** Korean improvement tip; present for `warn`/`fail`, absent otherwise. */
  tip?: string
}

/** One declarative check: identity + category + a pure evaluator over context. */
export interface CheckDefinition {
  /** Stable id within the registry (e.g. `seo-title`). */
  id: string
  /** Which auto-audit category this check contributes to. */
  category: AuditCategoryId
  /** Korean label of what is checked. */
  label: string
  /** Pure evaluation of this check against a parsed page context. */
  evaluate: (ctx: AuditContext) => CheckResult
}

// --- Tunable budgets (implementation thresholds, not design tokens) ---------

/** A generous baseline ceiling for a landing page's raw HTML (~200 KB). */
const HTML_SIZE_BUDGET = 200_000
/** Recommended title length window, in characters. */
const TITLE_MIN = 10
const TITLE_MAX = 60
/** Warn above this many external `<script src>` tags. */
const EXTERNAL_SCRIPT_BUDGET = 15
/** Warn above this many inline `style="…"` attributes. */
const INLINE_STYLE_BUDGET = 20

// --- SEO (5) ----------------------------------------------------------------

const SEO_CHECKS: CheckDefinition[] = [
  {
    id: 'seo-title',
    category: 'seo',
    label: '타이틀 태그',
    evaluate: (ctx) =>
      ctx.title.length > 0
        ? { status: 'pass', message: '타이틀 태그가 설정되어 있습니다.' }
        : {
            status: 'fail',
            message: '타이틀 태그가 비어 있거나 없습니다.',
            tip: '검색 결과에 노출될 고유한 타이틀을 추가하세요.',
          },
  },
  {
    id: 'seo-title-length',
    category: 'seo',
    label: '타이틀 길이',
    evaluate: (ctx) => {
      if (ctx.title.length === 0) {
        return { status: 'skip', message: '타이틀이 없어 길이를 평가할 수 없습니다.' }
      }
      if (ctx.title.length >= TITLE_MIN && ctx.title.length <= TITLE_MAX) {
        return { status: 'pass', message: '타이틀 길이가 권장 범위입니다.' }
      }
      return {
        status: 'warn',
        message:
          ctx.title.length < TITLE_MIN
            ? '타이틀이 너무 짧습니다.'
            : '타이틀이 너무 깁니다.',
        tip: `타이틀을 ${TITLE_MIN}~${TITLE_MAX}자 사이로 작성하세요.`,
      }
    },
  },
  {
    id: 'seo-meta-description',
    category: 'seo',
    label: '메타 설명',
    evaluate: (ctx) =>
      ctx.meta.description !== null
        ? { status: 'pass', message: '메타 설명이 설정되어 있습니다.' }
        : {
            status: 'fail',
            message: '메타 설명 태그가 없습니다.',
            tip: '페이지 내용을 요약한 meta description을 추가하세요.',
          },
  },
  {
    id: 'seo-h1',
    category: 'seo',
    label: '대표 제목(h1)',
    evaluate: (ctx) => {
      if (ctx.headings.h1Count === 1) {
        return { status: 'pass', message: '대표 제목(h1)이 하나 있습니다.' }
      }
      if (ctx.headings.h1Count === 0) {
        return {
          status: 'fail',
          message: '대표 제목(h1) 태그가 없습니다.',
          tip: 'h1 태그로 페이지의 대표 제목을 하나 지정하세요.',
        }
      }
      return {
        status: 'warn',
        message: '대표 제목(h1)이 여러 개입니다.',
        tip: 'h1은 페이지당 하나만 사용하세요.',
      }
    },
  },
  {
    id: 'seo-open-graph',
    category: 'seo',
    label: '오픈그래프 공유 태그',
    evaluate: (ctx) => {
      const hasTitle = ctx.meta.ogTitle !== null
      const hasImage = ctx.meta.ogImage !== null
      if (hasTitle && hasImage) {
        return { status: 'pass', message: '오픈그래프 공유 태그가 설정되어 있습니다.' }
      }
      return {
        status: 'warn',
        message:
          hasTitle || hasImage
            ? '오픈그래프 태그가 일부만 설정되어 있습니다.'
            : '오픈그래프 공유 태그가 없습니다.',
        tip: 'og:title과 og:image를 설정해 공유 시 미리보기를 개선하세요.',
      }
    },
  },
]

// --- 성능 Performance (4) ---------------------------------------------------

const PERFORMANCE_CHECKS: CheckDefinition[] = [
  {
    id: 'perf-html-size',
    category: 'performance',
    label: 'HTML 문서 크기',
    evaluate: (ctx) =>
      ctx.htmlSize <= HTML_SIZE_BUDGET
        ? { status: 'pass', message: 'HTML 문서 크기가 적정 범위입니다.' }
        : {
            status: 'warn',
            message: 'HTML 문서가 과도하게 큽니다.',
            tip: '인라인 리소스를 분리해 초기 문서 크기를 줄이세요.',
          },
  },
  {
    id: 'perf-external-scripts',
    category: 'performance',
    label: '외부 스크립트 수',
    evaluate: (ctx) =>
      ctx.scripts.external <= EXTERNAL_SCRIPT_BUDGET
        ? { status: 'pass', message: '외부 스크립트 수가 적정합니다.' }
        : {
            status: 'warn',
            message: '외부 스크립트가 많아 로딩이 느려질 수 있습니다.',
            tip: '불필요한 외부 스크립트를 줄이거나 지연 로딩하세요.',
          },
  },
  {
    id: 'perf-inline-styles',
    category: 'performance',
    label: '인라인 스타일 사용',
    evaluate: (ctx) =>
      ctx.inlineStyleCount <= INLINE_STYLE_BUDGET
        ? { status: 'pass', message: '인라인 스타일 사용이 적정합니다.' }
        : {
            status: 'warn',
            message: '인라인 스타일이 과도하게 사용되었습니다.',
            tip: '반복되는 인라인 스타일을 외부 CSS로 분리하세요.',
          },
  },
  {
    id: 'perf-image-lazyload',
    category: 'performance',
    label: '이미지 지연 로딩',
    evaluate: (ctx) => {
      if (ctx.images.total === 0) {
        return { status: 'skip', message: '이미지가 없어 지연 로딩 대상이 아닙니다.' }
      }
      if (ctx.images.lazyLoaded === ctx.images.total) {
        return { status: 'pass', message: '모든 이미지가 지연 로딩을 사용합니다.' }
      }
      return {
        status: 'warn',
        message:
          ctx.images.lazyLoaded > 0
            ? '일부 이미지에만 지연 로딩이 적용되어 있습니다.'
            : '이미지에 지연 로딩이 적용되지 않았습니다.',
        tip: '뷰포트 밖 이미지에 loading="lazy"를 적용하세요.',
      }
    },
  },
]

// --- 모바일 Mobile (4) ------------------------------------------------------

const MOBILE_CHECKS: CheckDefinition[] = [
  {
    id: 'mobile-viewport',
    category: 'mobile',
    label: '반응형 뷰포트',
    evaluate: (ctx) =>
      ctx.meta.viewport !== null
        ? {
            status: 'pass',
            message: '반응형 뷰포트 메타 태그가 설정되어 있습니다.',
          }
        : {
            status: 'fail',
            message: '뷰포트 메타 태그가 없어 모바일에서 확대되어 보일 수 있습니다.',
            tip: 'width=device-width 뷰포트 메타 태그를 추가하세요.',
          },
  },
  {
    id: 'mobile-device-width',
    category: 'mobile',
    label: '기기 너비 대응',
    evaluate: (ctx) => {
      if (ctx.meta.viewport === null) {
        return { status: 'skip', message: '뷰포트 메타 태그가 없어 평가할 수 없습니다.' }
      }
      return /width\s*=\s*device-width/i.test(ctx.meta.viewport)
        ? { status: 'pass', message: '뷰포트가 기기 너비에 맞춰져 있습니다.' }
        : {
            status: 'warn',
            message: '뷰포트에 width=device-width가 지정되어 있지 않습니다.',
            tip: '뷰포트 content에 width=device-width를 지정하세요.',
          }
    },
  },
  {
    id: 'mobile-initial-scale',
    category: 'mobile',
    label: '초기 확대 배율',
    evaluate: (ctx) => {
      if (ctx.meta.viewport === null) {
        return { status: 'skip', message: '뷰포트 메타 태그가 없어 평가할 수 없습니다.' }
      }
      return /initial-scale\s*=\s*1/i.test(ctx.meta.viewport)
        ? { status: 'pass', message: '초기 확대 배율이 1로 설정되어 있습니다.' }
        : {
            status: 'warn',
            message: '초기 확대 배율(initial-scale)이 설정되어 있지 않습니다.',
            tip: '뷰포트 content에 initial-scale=1을 추가하세요.',
          }
    },
  },
  {
    id: 'mobile-media-query',
    category: 'mobile',
    label: '반응형 미디어 쿼리',
    evaluate: (ctx) =>
      ctx.hasMediaQuery
        ? { status: 'pass', message: '반응형 미디어 쿼리가 있습니다.' }
        : {
            status: 'warn',
            message: '문서에서 반응형 미디어 쿼리를 찾지 못했습니다.',
            tip: '@media 쿼리로 화면 크기별 레이아웃을 제공하세요.',
          },
  },
]

// --- 보안 Security (4) ------------------------------------------------------

const SECURITY_CHECKS: CheckDefinition[] = [
  {
    id: 'security-https',
    category: 'security',
    label: 'HTTPS 제공',
    evaluate: (ctx) =>
      ctx.https
        ? { status: 'pass', message: '페이지가 HTTPS로 제공됩니다.' }
        : {
            status: 'fail',
            message: '페이지가 HTTPS로 제공되지 않습니다.',
            tip: 'TLS 인증서를 적용해 HTTPS로 제공하세요.',
          },
  },
  {
    id: 'security-mixed-content',
    category: 'security',
    label: '혼합 콘텐츠',
    evaluate: (ctx) => {
      if (!ctx.https) {
        return {
          status: 'skip',
          message: 'HTTPS 페이지가 아니어서 혼합 콘텐츠 판단 대상이 아닙니다.',
        }
      }
      return ctx.mixedContentCount === 0
        ? { status: 'pass', message: '혼합 콘텐츠(http 리소스)가 없습니다.' }
        : {
            status: 'fail',
            message: '보안 페이지에 http 리소스가 포함되어 있습니다.',
            tip: '모든 리소스를 https로 불러오도록 수정하세요.',
          }
    },
  },
  {
    id: 'security-external-link-safety',
    category: 'security',
    label: '새 창 링크 보안',
    evaluate: (ctx) => {
      if (ctx.links.blankTotal === 0) {
        return {
          status: 'skip',
          message: '새 창으로 여는 링크가 없어 판단 대상이 아닙니다.',
        }
      }
      return ctx.links.blankUnsafe === 0
        ? {
            status: 'pass',
            message: '새 창 링크에 rel="noopener"가 적용되어 있습니다.',
          }
        : {
            status: 'warn',
            message: 'rel="noopener" 없이 새 창으로 여는 링크가 있습니다.',
            tip: 'target="_blank" 링크에 rel="noopener"를 추가하세요.',
          }
    },
  },
  {
    id: 'security-inline-handlers',
    category: 'security',
    label: '인라인 이벤트 핸들러',
    evaluate: (ctx) =>
      !ctx.hasInlineEventHandlers
        ? { status: 'pass', message: '인라인 이벤트 핸들러가 없습니다.' }
        : {
            status: 'warn',
            message: '인라인 이벤트 핸들러(onclick 등)가 사용되었습니다.',
            tip: '이벤트는 외부 스크립트에서 바인딩해 CSP 적용을 쉽게 하세요.',
          },
  },
]

// --- 접근성 Accessibility (5) -----------------------------------------------

const ACCESSIBILITY_CHECKS: CheckDefinition[] = [
  {
    id: 'a11y-html-lang',
    category: 'accessibility',
    label: '문서 언어',
    evaluate: (ctx) =>
      ctx.lang !== null
        ? { status: 'pass', message: 'html 요소에 lang 속성이 지정되어 있습니다.' }
        : {
            status: 'fail',
            message: 'html 요소에 lang 속성이 없습니다.',
            tip: 'html 태그에 lang="ko" 같은 언어 속성을 추가하세요.',
          },
  },
  {
    id: 'a11y-img-alt',
    category: 'accessibility',
    label: '이미지 대체 텍스트',
    evaluate: (ctx) => {
      if (ctx.images.total === 0) {
        return { status: 'skip', message: '페이지에 이미지가 없어 판단 대상이 아닙니다.' }
      }
      return ctx.images.missingAlt === 0
        ? { status: 'pass', message: '모든 이미지에 대체 텍스트가 있습니다.' }
        : {
            status: 'warn',
            message: '대체 텍스트가 없는 이미지가 있습니다.',
            tip: '모든 의미 있는 이미지에 alt 속성을 추가하세요.',
          }
    },
  },
  {
    id: 'a11y-heading-structure',
    category: 'accessibility',
    label: '제목 구조',
    evaluate: (ctx) =>
      ctx.headings.totalCount > 0
        ? { status: 'pass', message: '제목 태그로 문서 구조가 구성되어 있습니다.' }
        : {
            status: 'fail',
            message: '제목(heading) 태그가 없습니다.',
            tip: 'h1~h6 제목 태그로 문서의 구조를 제공하세요.',
          },
  },
  {
    id: 'a11y-form-labels',
    category: 'accessibility',
    label: '입력 레이블',
    evaluate: (ctx) => {
      if (ctx.inputs.total === 0) {
        return { status: 'skip', message: '입력 폼이 없어 판단 대상이 아닙니다.' }
      }
      return ctx.inputs.unlabeled === 0
        ? {
            status: 'pass',
            message: '모든 입력 요소에 레이블이 연결되어 있습니다.',
          }
        : {
            status: 'fail',
            message: '레이블이 연결되지 않은 입력 요소가 있습니다.',
            tip: '모든 입력 요소에 label 또는 aria-label을 연결하세요.',
          }
    },
  },
  {
    id: 'a11y-zoom-enabled',
    category: 'accessibility',
    label: '화면 확대 허용',
    evaluate: (ctx) => {
      if (ctx.meta.viewport === null) {
        return {
          status: 'skip',
          message: '뷰포트 메타 태그가 없어 확대 설정을 평가할 수 없습니다.',
        }
      }
      const locked =
        /user-scalable\s*=\s*(no|0)/i.test(ctx.meta.viewport) ||
        /maximum-scale\s*=\s*1(\.0+)?\b/i.test(ctx.meta.viewport)
      return locked
        ? {
            status: 'fail',
            message: '사용자 화면 확대가 비활성화되어 있습니다.',
            tip: 'user-scalable=no와 maximum-scale 제한을 제거해 확대를 허용하세요.',
          }
        : { status: 'pass', message: '사용자 화면 확대가 허용되어 있습니다.' }
    },
  },
]

/**
 * The full 22-check registry in canonical (category, then declared) order:
 * SEO 5 → 성능 4 → 모바일 4 → 보안 4 → 접근성 5.
 */
export const CHECK_REGISTRY: readonly CheckDefinition[] = [
  ...SEO_CHECKS,
  ...PERFORMANCE_CHECKS,
  ...MOBILE_CHECKS,
  ...SECURITY_CHECKS,
  ...ACCESSIBILITY_CHECKS,
]

/** How many checks each category contributes (SEO 5 / 성능 4 / … / 접근성 5). */
export const CHECK_COUNT = CHECK_REGISTRY.length

/**
 * Runs one check against a context and folds its identity in, producing the
 * report-facing {@link CheckItem}. `tip` is omitted (not `undefined`) when the
 * result has none, matching the optional-property contract of `CheckItem`.
 */
export function evaluateCheck(def: CheckDefinition, ctx: AuditContext): CheckItem {
  const result = def.evaluate(ctx)
  return {
    id: def.id,
    label: def.label,
    status: result.status,
    message: result.message,
    ...(result.tip !== undefined ? { tip: result.tip } : {}),
  }
}

/**
 * Runs every registered check against `ctx`, returning the {@link CheckItem}s in
 * registry order. This is the whole-registry evaluation the scorer consumes; it
 * does not group or score — it only produces the per-check outcomes.
 */
export function evaluateAllChecks(ctx: AuditContext): CheckItem[] {
  return CHECK_REGISTRY.map((def) => evaluateCheck(def, ctx))
}

/**
 * Groups the registry's checks by category id, preserving declared order within
 * each category — a convenience for the scorer/report builder that assembles the
 * five {@link ../core/report#AuditCategory} blocks.
 */
export function checksByCategory(
  ctx: AuditContext,
): Record<AuditCategoryId, CheckItem[]> {
  const grouped: Record<AuditCategoryId, CheckItem[]> = {
    seo: [],
    performance: [],
    mobile: [],
    security: [],
    accessibility: [],
  }
  for (const def of CHECK_REGISTRY) {
    grouped[def.category].push(evaluateCheck(def, ctx))
  }
  return grouped
}
