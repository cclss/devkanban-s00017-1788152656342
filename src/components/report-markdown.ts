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
 *   adds a dedicated English guidance notice near the top, states the "out of 60
 *   (auto-audit only)" scale, and prints the AI-drop reason instead of AI axes,
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
 * Standalone English guidance sentence stating, in plain terms, that this is a
 * partial report written on the 60-point auto-audit scale because the AI step
 * was dropped. Rendered as a dedicated notice block near the top of a
 * `done-partial` document (never in a `done` document), so a reader who opens
 * the downloaded file immediately understands the scope of the result
 * (Validation SC-3). Confirmed English domain copy, not a design token.
 */
export const PARTIAL_REPORT_NOTICE =
  'This is a partial report written on the 60-point auto-audit scale because AI evaluation was skipped.'

/**
 * English notice shown when the AI rubric was scored on the page text alone
 * because the selected model does not accept image input, so the captured
 * screenshots were not sent. Single source of the string, shared by the report
 * view and this markdown exporter so both surfaces read identically. Confirmed
 * English domain copy, not a design token.
 */
export const SCREENSHOTS_OMITTED_NOTICE = 'Evaluated without screenshots'

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
    if (check.tip) lines.push(`  - Tip: ${check.tip}`)
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
    lines.push(`- Suggestion: ${suggestion}`)
  }
  return lines
}

/**
 * Renders a completed report to a markdown document.
 *
 * The output includes the total/grade header, the score breakdown, every audit
 * category with its checks (fail-first) and English tips, and the AI axes'
 * comments and suggestions. For a `done-partial` report it prints the 60-point
 * scale note and the AI-drop reason in place of the AI axes, and holds the grade
 * as "Grade withheld".
 *
 * @param report The completed (`done` / `done-partial`) report.
 * @returns The full markdown document as a single string.
 */
export function buildReportMarkdown(report: AnalysisReport): string {
  const { score } = report
  const partial = report.outcome === 'done-partial'

  const lines: string[] = ['# Landing Page Quality Report', '']
  lines.push(`- Target URL: ${report.url}`)
  lines.push(`- Analyzed at: ${report.analyzedAt}`)
  lines.push(
    partial
      ? `- Total score: ${score.total} / ${score.max} (out of ${AUDIT_MAX_SCORE}, auto-audit only)`
      : `- Total score: ${score.total} / ${score.max}`,
  )
  lines.push(`- Grade: ${GRADE_LABELS[score.grade]}`)
  lines.push('')

  // Dedicated partial-result guidance block. Only a `done-partial` document
  // carries it; a `done` document skips it entirely so its output is unchanged.
  if (partial) {
    lines.push('> **Partial result notice**')
    lines.push(`> ${PARTIAL_REPORT_NOTICE}`)
    if (report.partialReason) {
      lines.push(`> ${report.partialReason}`)
    }
    if (report.partialDetail) {
      lines.push(`> ${report.partialDetail}`)
    }
    lines.push('')
  }

  lines.push('## Score summary')
  lines.push(`- Auto-audit: ${score.auditScore}/${score.auditMax}`)
  lines.push(
    score.llmScore === null
      ? '- AI rubric: unavailable'
      : `- AI rubric: ${score.llmScore}/${score.llmMax}`,
  )
  if (partial && report.partialReason) {
    lines.push(`- Partial result reason: ${report.partialReason}`)
  }
  if (partial && report.partialDetail) {
    lines.push(`- Partial result detail: ${report.partialDetail}`)
  }
  // Provider status code + key-masked error summary (already redacted upstream),
  // so the downloaded file carries the same diagnostic detail the screen shows.
  if (partial && report.partialStatusCode !== undefined) {
    lines.push(`- Provider status code: ${report.partialStatusCode}`)
  }
  if (partial && report.partialSummary) {
    lines.push(`- Provider response: ${report.partialSummary}`)
  }
  lines.push('')

  lines.push('## Category scores')
  for (const category of report.categories) {
    lines.push(...renderCategory(category))
    lines.push('')
  }

  lines.push('## AI evaluation')
  // The AI score is text-only because the model can't accept images.
  if (report.screenshotsOmitted) {
    lines.push(`_${SCREENSHOTS_OMITTED_NOTICE}_`)
    lines.push('')
  }
  if (report.llmAxes && report.llmAxes.length > 0) {
    for (const axis of report.llmAxes) {
      lines.push(...renderAxis(axis))
      lines.push('')
    }
  } else {
    lines.push(
      report.partialReason ??
        'No AI evaluation results: showing auto-audit results only.',
    )
    if (report.partialDetail) {
      lines.push(report.partialDetail)
    }
    lines.push('')
  }

  // Trim the trailing blank line into a single terminating newline.
  return `${lines.join('\n').trimEnd()}\n`
}
