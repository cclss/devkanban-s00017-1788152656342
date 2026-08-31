/**
 * Shared, React-free display vocabulary for the report surface.
 *
 * The check-status / grade Korean labels, the check-status → badge-modifier
 * map, and the fail-first check ordering all live here so both the rendered
 * {@link ../components/ReportView} and the pure markdown exporter
 * ({@link ./report-markdown}) agree on one source of copy and ordering — and so
 * the exporter stays importable in the fast `node` test environment without
 * pulling React in.
 *
 * All strings here are confirmed Korean domain content (mirroring the report
 * domain labels in `core/report.ts`), not design tokens.
 */
import type { CheckStatus, Grade } from '../core/report'

/** Korean, user-facing label for each check result. */
export const CHECK_STATUS_LABELS: Readonly<Record<CheckStatus, string>> = {
  pass: '통과',
  warn: '경고',
  fail: '실패',
  skip: '해당없음',
} as const

/**
 * Maps a check status to the `grader-badge` colour modifier defined in the
 * presentation base. `skip` reuses the neutral `--na` look.
 */
export const CHECK_STATUS_BADGE: Readonly<Record<CheckStatus, string>> = {
  pass: 'pass',
  warn: 'warn',
  fail: 'fail',
  skip: 'na',
} as const

/** Korean, user-facing label for each overall grade tier. */
export const GRADE_LABELS: Readonly<Record<Grade, string>> = {
  excellent: '우수',
  good: '양호',
  fair: '보통',
  poor: '미흡',
  pending: '등급 보류',
} as const

/**
 * Ordering weight for the fail-first checklist: real failures surface first,
 * then warnings, then passes, and inapplicable checks last. Lower sorts first.
 */
const STATUS_PRIORITY: Readonly<Record<CheckStatus, number>> = {
  fail: 0,
  warn: 1,
  pass: 2,
  skip: 3,
} as const

/**
 * Returns a new array of `checks` ordered fail-first (fail → warn → pass →
 * skip). Equal-status checks keep their original relative order (stable sort),
 * so the registry order is preserved within a status band. The input array is
 * not mutated.
 */
export function sortChecksFailFirst<T extends { status: CheckStatus }>(
  checks: readonly T[],
): T[] {
  return [...checks].sort(
    (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status],
  )
}
