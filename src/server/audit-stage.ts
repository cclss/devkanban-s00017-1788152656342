/**
 * The `audit` stage: minimal, real auto-audit checks over fetched HTML.
 *
 * This is the baseline auto-audit — a deliberately small set of *real* checks
 * run by parsing the page's HTML string (regex, no DOM), one or more per
 * category, producing the five {@link AuditCategory} blocks and their combined
 * 60-point score. The full 22-check registry is a later grain; this stage keeps
 * the pipeline honest with genuine signal (does the page actually have a title,
 * a viewport meta, HTTPS, a `lang`, alt text?) rather than stub numbers.
 *
 * Scoring: each category is worth an equal slice of {@link AUDIT_MAX_SCORE}. A
 * category's score is its pass-ratio over its *non-skip* checks (skips are
 * normalised out of the denominator, per the Story spec); a category made up
 * entirely of skips scores full marks (nothing was applicable to penalise).
 *
 * Boundary: standalone backend module reusing only `core/report` types. It is
 * pure (HTML in → categories out), so it unit-tests with plain string fixtures.
 */
import {
  AUDIT_CATEGORY_IDS,
  AUDIT_CATEGORY_LABELS,
  AUDIT_MAX_SCORE,
  type AuditCategory,
  type AuditCategoryId,
  type CheckItem,
  type CheckStatus,
} from '../core/report'

/** Outcome of the audit stage: the scored categories plus their total. */
export interface AuditResult {
  /** The five scored categories, in canonical order. */
  categories: AuditCategory[]
  /** Combined auto-audit points earned (0–{@link AUDIT_MAX_SCORE}). */
  auditScore: number
  /** Auto-audit maximum ({@link AUDIT_MAX_SCORE}). */
  auditMax: number
}

/** Per-category point budget: the 60-point total split evenly across the five. */
const CATEGORY_MAX = AUDIT_MAX_SCORE / AUDIT_CATEGORY_IDS.length

/** A raw check spec before it is placed in its category block. */
interface CheckSpec {
  id: string
  label: string
  status: CheckStatus
  message: string
  tip?: string
}

function has(re: RegExp, html: string): boolean {
  return re.test(html)
}

/** Extracts the first `<title>…</title>` inner text, trimmed, or `''`. */
function titleText(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return match ? match[1].trim() : ''
}

/** All `<img …>` tags on the page (used to decide alt-text applicability). */
function imgTags(html: string): string[] {
  return html.match(/<img\b[^>]*>/gi) ?? []
}

function seoChecks(html: string): CheckSpec[] {
  const title = titleText(html)
  const hasDescription = has(
    /<meta[^>]+name=["']description["'][^>]*>/i,
    html,
  )
  return [
    {
      id: 'seo-title',
      label: '타이틀 태그',
      status: title.length > 0 ? 'pass' : 'fail',
      message:
        title.length > 0
          ? '타이틀 태그가 설정되어 있습니다.'
          : '타이틀 태그가 비어 있거나 없습니다.',
      tip:
        title.length > 0 ? undefined : '검색 결과에 노출될 고유한 타이틀을 추가하세요.',
    },
    {
      id: 'seo-meta-description',
      label: '메타 설명',
      status: hasDescription ? 'pass' : 'fail',
      message: hasDescription
        ? '메타 설명이 설정되어 있습니다.'
        : '메타 설명 태그가 없습니다.',
      tip: hasDescription
        ? undefined
        : '페이지 내용을 요약한 meta description을 추가하세요.',
    },
  ]
}

/** ~200KB of HTML is a generous baseline ceiling for a landing page. */
const HTML_SIZE_BUDGET = 200_000

function performanceChecks(html: string): CheckSpec[] {
  const withinBudget = html.length <= HTML_SIZE_BUDGET
  return [
    {
      id: 'perf-html-size',
      label: 'HTML 문서 크기',
      status: withinBudget ? 'pass' : 'warn',
      message: withinBudget
        ? 'HTML 문서 크기가 적정 범위입니다.'
        : 'HTML 문서가 과도하게 큽니다.',
      tip: withinBudget
        ? undefined
        : '인라인 리소스를 분리해 초기 문서 크기를 줄이세요.',
    },
  ]
}

function mobileChecks(html: string): CheckSpec[] {
  const hasViewport = has(/<meta[^>]+name=["']viewport["'][^>]*>/i, html)
  return [
    {
      id: 'mobile-viewport',
      label: '반응형 뷰포트',
      status: hasViewport ? 'pass' : 'fail',
      message: hasViewport
        ? '반응형 뷰포트 메타 태그가 설정되어 있습니다.'
        : '뷰포트 메타 태그가 없어 모바일에서 확대되어 보일 수 있습니다.',
      tip: hasViewport
        ? undefined
        : 'width=device-width 뷰포트 메타 태그를 추가하세요.',
    },
  ]
}

function securityChecks(url: string): CheckSpec[] {
  const isHttps = url.toLowerCase().startsWith('https://')
  return [
    {
      id: 'security-https',
      label: 'HTTPS 제공',
      status: isHttps ? 'pass' : 'fail',
      message: isHttps
        ? '페이지가 HTTPS로 제공됩니다.'
        : '페이지가 HTTPS로 제공되지 않습니다.',
      tip: isHttps ? undefined : 'TLS 인증서를 적용해 HTTPS로 제공하세요.',
    },
  ]
}

function accessibilityChecks(html: string): CheckSpec[] {
  const hasLang = has(/<html[^>]+lang=["'][^"']+["']/i, html)
  const imgs = imgTags(html)
  const missingAlt = imgs.filter((tag) => !/\balt=/i.test(tag))
  const altApplicable = imgs.length > 0
  return [
    {
      id: 'a11y-html-lang',
      label: '문서 언어',
      status: hasLang ? 'pass' : 'fail',
      message: hasLang
        ? 'html 요소에 lang 속성이 지정되어 있습니다.'
        : 'html 요소에 lang 속성이 없습니다.',
      tip: hasLang ? undefined : 'html 태그에 lang="ko" 같은 언어 속성을 추가하세요.',
    },
    {
      id: 'a11y-img-alt',
      label: '이미지 대체 텍스트',
      status: !altApplicable ? 'skip' : missingAlt.length === 0 ? 'pass' : 'warn',
      message: !altApplicable
        ? '페이지에 이미지가 없어 판단 대상이 아닙니다.'
        : missingAlt.length === 0
          ? '모든 이미지에 대체 텍스트가 있습니다.'
          : '대체 텍스트가 없는 이미지가 있습니다.',
      tip:
        altApplicable && missingAlt.length > 0
          ? '모든 의미 있는 이미지에 alt 속성을 추가하세요.'
          : undefined,
    },
  ]
}

/** Builds the raw check specs for a category from the fetched HTML + URL. */
function checksFor(id: AuditCategoryId, html: string, url: string): CheckSpec[] {
  switch (id) {
    case 'seo':
      return seoChecks(html)
    case 'performance':
      return performanceChecks(html)
    case 'mobile':
      return mobileChecks(html)
    case 'security':
      return securityChecks(url)
    case 'accessibility':
      return accessibilityChecks(html)
  }
}

/** Weight of a check status toward the category score (skip is excluded). */
const STATUS_WEIGHT: Readonly<Record<Exclude<CheckStatus, 'skip'>, number>> = {
  pass: 1,
  warn: 0.5,
  fail: 0,
} as const

/**
 * Scores one category: the pass-ratio over its non-skip checks, scaled to
 * {@link CATEGORY_MAX} and rounded. An all-skip category scores full marks
 * (denominator is empty — nothing applicable to penalise).
 */
function scoreCategory(checks: CheckItem[]): number {
  const scored = checks.filter((c) => c.status !== 'skip')
  if (scored.length === 0) return CATEGORY_MAX
  const earned = scored.reduce(
    (sum, c) => sum + STATUS_WEIGHT[c.status as Exclude<CheckStatus, 'skip'>],
    0,
  )
  return Math.round((earned / scored.length) * CATEGORY_MAX)
}

/**
 * Runs the baseline auto-audit over fetched HTML, returning the five scored
 * categories and the combined 60-point auto score. `url` is used for the
 * transport-level checks (HTTPS) that HTML alone cannot answer.
 */
export function runAudit(html: string, url: string): AuditResult {
  const categories: AuditCategory[] = AUDIT_CATEGORY_IDS.map((id) => {
    const checks: CheckItem[] = checksFor(id, html, url).map((spec) => ({
      id: spec.id,
      label: spec.label,
      status: spec.status,
      message: spec.message,
      ...(spec.tip !== undefined ? { tip: spec.tip } : {}),
    }))
    return {
      id,
      label: AUDIT_CATEGORY_LABELS[id],
      score: scoreCategory(checks),
      maxScore: CATEGORY_MAX,
      checks,
    }
  })

  const auditScore = categories.reduce((sum, c) => sum + c.score, 0)
  return { categories, auditScore, auditMax: AUDIT_MAX_SCORE }
}
