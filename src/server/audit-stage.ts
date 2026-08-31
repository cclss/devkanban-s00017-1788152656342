/**
 * The `audit` stage: the registry-driven auto-audit over fetched HTML.
 *
 * This stage owns *scoring*, not *checking*. The 22 real checks — five
 * categories worth 60 points combined — live declaratively in
 * {@link ./check-registry}, each a pure function of one {@link ./audit-context}.
 * `runAudit` parses the page once with {@link buildAuditContext}, groups the
 * evaluated checks by category with {@link checksByCategory}, and turns each
 * category's per-check outcomes into the five {@link AuditCategory} blocks and
 * their combined 60-point score.
 *
 * Scoring: each category is worth an equal slice of {@link AUDIT_MAX_SCORE}. A
 * category's score is its pass-ratio over its *non-skip* checks (skips are
 * normalised out of the denominator, per the Story spec); a category made up
 * entirely of skips scores full marks (nothing was applicable to penalise).
 *
 * Boundary: standalone backend module composing the grain-1 context/registry
 * modules over `core/report` types. It is pure (HTML + URL in → categories out),
 * so it unit-tests with plain string fixtures.
 */
import {
  AUDIT_CATEGORY_IDS,
  AUDIT_CATEGORY_LABELS,
  AUDIT_MAX_SCORE,
  type AuditCategory,
  type CheckItem,
  type CheckStatus,
} from '../core/report'
import { buildAuditContext } from './audit-context'
import { checksByCategory } from './check-registry'

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
 * Runs the registry-driven auto-audit over fetched HTML, returning the five
 * scored categories and the combined 60-point auto score. `url` is used for the
 * transport-level checks (HTTPS) that HTML alone cannot answer.
 */
export function runAudit(html: string, url: string): AuditResult {
  const grouped = checksByCategory(buildAuditContext(html, url))
  const categories: AuditCategory[] = AUDIT_CATEGORY_IDS.map((id) => {
    const checks = grouped[id]
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
