/**
 * Pure markdown exporter for a completed analysis report.
 *
 * Two React-free concerns live here so they can be unit tested in the fast
 * `node` environment, without a DOM:
 *
 * - {@link buildReportFilename} — derives the deterministic download name
 *   `landing-report-<host>-<timestamp>.md` from the report's URL and
 *   `analyzedAt` (Validation SC-2).
 * - {@link buildReportMarkdown} — renders the full report (total, grade,
 *   per-category scores, every check with its status and tip, and the AI axes'
 *   comments/suggestions) to a markdown document. On a `done-partial` report it
 *   states the "60점 만점 기준" scale and the AI-drop reason instead of AI axes,
 *   so the downloaded file matches what the screen shows (SC-3).
 *
 * Wrapping the string in a Blob and triggering the browser download is the
 * component's job (via `core/download`'s `downloadBlob`); this module only
 * produces text.
 */
import {
  AUDIT_MAX_SCORE,
  type AnalysisReport,
  type AuditCategory,
  type LlmAxis,
} from '../core/report'
import { CHECK_STATUS_LABELS, GRADE_LABELS, sortChecksFailFirst } from './report-labels'

/** Characters unsafe in a file name (reserved across common platforms). */
const UNSAFE_FILENAME_CHARS = /[<>:"|?*/\\]+/g

/**
 * Reduces a URL to a safe host segment for the download name. Falls back to
 * `unknown-host` when the URL cannot be parsed (should not happen for a
 * completed report, but keeps the name well-formed regardless).
 */
function safeHost(url: string): string {
  let host: string
  try {
    host = new URL(url).host
  } catch {
    return 'unknown-host'
  }
  const safe = host.replace(UNSAFE_FILENAME_CHARS, '_').trim()
  return safe.length > 0 ? safe : 'unknown-host'
}

/**
 * Reduces an ISO-8601 timestamp to a compact, filesystem-safe stamp, e.g.
 * `2026-08-31T09:00:00.000Z` → `2026-08-31T090000`. Falls back to the raw,
 * sanitized string when it does not match the expected ISO shape.
 */
function safeTimestamp(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso)
  if (match) {
    const [, date, hh, mm, ss] = match
    return `${date}T${hh}${mm}${ss}`
  }
  return iso.replace(UNSAFE_FILENAME_CHARS, '_')
}

/**
 * Builds the deterministic markdown download name for a report:
 * `landing-report-<host>-<timestamp>.md` (Validation SC-2).
 *
 * @param report The completed report to name a file for.
 * @returns A bare, safe file name ending in `.md`.
 */
export function buildReportFilename(report: AnalysisReport): string {
  return `landing-report-${safeHost(report.url)}-${safeTimestamp(report.analyzedAt)}.md`
}

/** Renders one category block: heading with its score, then its checks. */
function renderCategory(category: AuditCategory): string[] {
  const lines: string[] = [
    `### ${category.label} (${category.score}/${category.maxScore})`,
  ]
  for (const check of sortChecksFailFirst(category.checks)) {
    lines.push(`- [${CHECK_STATUS_LABELS[check.status]}] ${check.label} — ${check.message}`)
    if (check.tip) lines.push(`  - 팁: ${check.tip}`)
  }
  return lines
}

/** Renders one AI axis block: heading with its score, comment, suggestions. */
function renderAxis(axis: LlmAxis): string[] {
  const lines: string[] = [
    `### ${axis.label} (${axis.score}/${axis.maxScore})`,
    axis.comment,
  ]
  for (const suggestion of axis.suggestions) {
    lines.push(`- 제안: ${suggestion}`)
  }
  return lines
}

/**
 * Renders a completed report to a markdown document.
 *
 * The output includes the total/grade header, the score breakdown, every audit
 * category with its checks (fail-first) and Korean tips, and the AI axes'
 * comments and suggestions. For a `done-partial` report it prints the 60-point
 * scale note and the AI-drop reason in place of the AI axes, and holds the grade
 * as "등급 보류".
 *
 * @param report The completed (`done` / `done-partial`) report.
 * @returns The full markdown document as a single string.
 */
export function buildReportMarkdown(report: AnalysisReport): string {
  const { score } = report
  const partial = report.outcome === 'done-partial'

  const lines: string[] = ['# 랜딩페이지 품질 리포트', '']
  lines.push(`- 대상 URL: ${report.url}`)
  lines.push(`- 분석 시각: ${report.analyzedAt}`)
  lines.push(
    partial
      ? `- 총점: ${score.total} / ${score.max} (자동 점검 ${AUDIT_MAX_SCORE}점 만점 기준)`
      : `- 총점: ${score.total} / ${score.max}`,
  )
  lines.push(`- 등급: ${GRADE_LABELS[score.grade]}`)
  lines.push('')

  lines.push('## 점수 요약')
  lines.push(`- 자동 점검: ${score.auditScore}/${score.auditMax}`)
  lines.push(
    score.llmScore === null
      ? '- AI 루브릭: 평가 불가'
      : `- AI 루브릭: ${score.llmScore}/${score.llmMax}`,
  )
  if (partial && report.partialReason) {
    lines.push(`- 부분 결과 사유: ${report.partialReason}`)
  }
  lines.push('')

  lines.push('## 카테고리별 점수')
  for (const category of report.categories) {
    lines.push(...renderCategory(category))
    lines.push('')
  }

  lines.push('## AI 평가')
  if (report.llmAxes && report.llmAxes.length > 0) {
    for (const axis of report.llmAxes) {
      lines.push(...renderAxis(axis))
      lines.push('')
    }
  } else {
    lines.push(
      report.partialReason ??
        'AI 평가 결과 없음: 자동 점검 결과만 표시합니다.',
    )
    lines.push('')
  }

  // Trim the trailing blank line into a single terminating newline.
  return `${lines.join('\n').trimEnd()}\n`
}
