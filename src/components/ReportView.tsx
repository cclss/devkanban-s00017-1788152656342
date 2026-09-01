/**
 * Third block of the grader's 3-block layout: the report.
 *
 * ReportView renders one terminal {@link ReportResult} and branches on its
 * `outcome`, mirroring the Design's state-transition rules:
 *
 * - `done`: the full 100-point report — total gauge + grade badge, the five
 *   auto-audit category cards and the three AI-axis score cards, desktop/mobile
 *   screenshot tabs, the fail-first checklist grouped by category, the AI axis
 *   comments, and the markdown download button.
 * - `done-partial`: the AI step failed, so the report is on the 60-point
 *   auto-audit scale only. The gauge shows the 60-point max with a "60점 만점
 *   기준" note, the grade badge reads "등급 보류", and the AI score cards +
 *   comments are replaced by the Korean `partialReason` notice. Categories,
 *   checklist, screenshots and download stay.
 * - `error-load`: the page never loaded, so no report exists. The whole report
 *   is hidden and only a single Korean error card (message + optional status
 *   code) is shown.
 *
 * When `report` is `null` (no terminal result yet — idle/in-progress) nothing is
 * rendered; the stepper carries the in-progress state.
 *
 * Boundary: presentational component. It reads the report domain data and
 * renders it; it holds only local view state (the active screenshot tab) and
 * delegates the actual byte download to `core/download`. All copy is co-located
 * Korean domain content, not design tokens.
 */
import { useState } from 'react'
import {
  AUDIT_MAX_SCORE,
  type AnalysisReport,
  type LoadErrorReport,
  type ReportResult,
  type ViewportKind,
} from '../core/report'
import { downloadBlob } from '../core/download'
import {
  CHECK_STATUS_BADGE,
  CHECK_STATUS_LABELS,
  GRADE_LABELS,
  sortChecksFailFirst,
} from './report-labels'
import { buildReportFilename, buildReportMarkdown } from './report-markdown'
import InfoTooltip from './InfoTooltip'
import { CONTROL_HELP } from './control-help'

/**
 * Korean, user-facing copy for the report view. Co-located confirmed domain
 * content (mirroring the report-domain labels), not design tokens. Exported so
 * tests assert against the single source of the copy.
 */
export const REPORT_VIEW_STRINGS = {
  /** Accessible label for the whole report region. */
  regionLabel: '진단 리포트',
  /** Heading above the total score gauge. */
  totalHeading: '총점',
  /** Note shown next to the gauge on a partial (60-point) report. */
  partialScaleNote: `자동 점검 ${AUDIT_MAX_SCORE}점 만점 기준`,
  /** Section heading for the auto-audit category score cards. */
  categoryScoresHeading: '카테고리 점수',
  /** Section heading for the AI-rubric axis score cards. */
  aiScoresHeading: 'AI 평가',
  /** Section heading for the screenshot tabs. */
  screenshotsHeading: '스크린샷',
  /** Section heading for the per-category checklist. */
  checklistHeading: '체크리스트',
  /** Section heading for the AI axis comments. */
  aiCommentsHeading: 'AI 코멘트',
  /** Label prefix for a check's improvement tip. */
  tipLabel: '팁',
  /** Label prefix for an AI axis improvement suggestion. */
  suggestionLabel: '제안',
  /** Markdown download button. */
  download: '마크다운 리포트 다운로드',
  /** Disclosure toggle revealing the detailed failure reason. */
  detailToggle: '실패 사유 자세히 보기',
  /** Accessible label for the error card region. */
  errorLabel: '진단 실패',
  /** Screenshot viewport tab labels. */
  viewportLabels: { desktop: '데스크톱', mobile: '모바일' } as Record<ViewportKind, string>,
} as const

/** MIME type for the downloaded markdown file. */
const MARKDOWN_MIME = 'text/markdown;charset=utf-8'

/**
 * Expandable "자세히 보기" disclosure carrying the detailed failure reason. Kept
 * collapsed by default so the terse headline message/notice stays scannable, and
 * renders nothing when there is no detail (e.g. a synthetic client-side error).
 */
function FailureDetail({ detail }: { detail: string | undefined }) {
  if (detail === undefined || detail === '') return null
  return (
    <details className="report-detail">
      <summary className="report-detail__summary">
        {REPORT_VIEW_STRINGS.detailToggle}
      </summary>
      <p className="report-detail__body">{detail}</p>
    </details>
  )
}

/** Renders the single Korean error card for an `error-load` result. */
function LoadError({ report }: { report: LoadErrorReport }) {
  return (
    <section
      className="report-view grader-block"
      aria-label={REPORT_VIEW_STRINGS.errorLabel}
    >
      <div className="grader-card grader-card--danger report-error">
        <p className="report-error__message">{report.message}</p>
        {report.statusCode !== undefined ? (
          <p className="report-error__code">상태 코드: {report.statusCode}</p>
        ) : null}
        <FailureDetail detail={report.detail} />
      </div>
    </section>
  )
}

export interface ReportViewProps {
  /**
   * The terminal report to render, or `null` when there is no result yet
   * (idle / in-progress). `null` renders nothing.
   */
  report: ReportResult | null
}

/**
 * @param props See {@link ReportViewProps}.
 */
export default function ReportView({ report }: ReportViewProps) {
  const [viewport, setViewport] = useState<ViewportKind>('desktop')

  if (report === null) return null
  if (report.outcome === 'error-load') return <LoadError report={report} />

  return <AnalysisReportView report={report} viewport={viewport} onViewport={setViewport} />
}

/** The `done` / `done-partial` report body. */
function AnalysisReportView({
  report,
  viewport,
  onViewport,
}: {
  report: AnalysisReport
  viewport: ViewportKind
  onViewport: (viewport: ViewportKind) => void
}) {
  const partial = report.outcome === 'done-partial'
  const { score } = report

  const handleDownload = () => {
    const markdown = buildReportMarkdown(report)
    const blob = new Blob([markdown], { type: MARKDOWN_MIME })
    downloadBlob(blob, buildReportFilename(report))
  }

  // The active screenshot; falls back to the first capture if the selected
  // viewport was not captured, so a tab always has an image to show.
  const activeShot =
    report.screenshots.find((shot) => shot.viewport === viewport) ??
    report.screenshots[0]

  return (
    <section
      className="report-view grader-block"
      aria-label={REPORT_VIEW_STRINGS.regionLabel}
    >
      {/* ── Total gauge + grade badge ─────────────────────────── */}
      <div className="grader-card report-summary">
        <div className="report-gauge">
          <p className="report-gauge__heading">{REPORT_VIEW_STRINGS.totalHeading}</p>
          <p className="report-gauge__score">
            <span className="report-gauge__value">{score.total}</span>
            <span className="report-gauge__max">/ {score.max}</span>
          </p>
          <div
            className="report-gauge__bar"
            role="meter"
            aria-valuenow={score.total}
            aria-valuemin={0}
            aria-valuemax={score.max}
          >
            <span
              className="report-gauge__fill"
              style={{ inlineSize: `${percent(score.total, score.max)}%` }}
            />
          </div>
        </div>
        <div className="report-summary__grade">
          <span className={`grader-badge grader-badge--grade-${score.grade}`}>
            {GRADE_LABELS[score.grade]}
          </span>
          {partial ? (
            <p className="report-summary__note">{REPORT_VIEW_STRINGS.partialScaleNote}</p>
          ) : null}
        </div>
      </div>

      {/* ── Category score cards ──────────────────────────────── */}
      <div className="report-section">
        <h3 className="report-section__title">{REPORT_VIEW_STRINGS.categoryScoresHeading}</h3>
        <div className="report-score-grid">
          {report.categories.map((category) => (
            <div key={category.id} className="grader-card grader-card--muted report-score-card">
              <p className="report-score-card__label">{category.label}</p>
              <p className="report-score-card__value">
                {category.score}
                <span className="report-score-card__max">/ {category.maxScore}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── AI axis score cards (or partial notice) ───────────── */}
      <div className="report-section">
        <h3 className="report-section__title">{REPORT_VIEW_STRINGS.aiScoresHeading}</h3>
        {report.llmAxes ? (
          <div className="report-score-grid">
            {report.llmAxes.map((axis) => (
              <div key={axis.id} className="grader-card grader-card--muted report-score-card">
                <p className="report-score-card__label">{axis.label}</p>
                <p className="report-score-card__value">
                  {axis.score}
                  <span className="report-score-card__max">/ {axis.maxScore}</span>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="grader-card grader-card--muted report-partial-notice" role="status">
            <p className="report-partial-notice__reason">{report.partialReason}</p>
            <FailureDetail detail={report.partialDetail} />
          </div>
        )}
      </div>

      {/* ── Screenshot tabs ───────────────────────────────────── */}
      {report.screenshots.length > 0 && activeShot ? (
        <div className="report-section">
          <div className="control-help">
            <h3 className="report-section__title">{REPORT_VIEW_STRINGS.screenshotsHeading}</h3>
            <InfoTooltip entry={CONTROL_HELP.screenshotTabs} />
          </div>
          <div className="report-shots">
            <div className="report-shots__tabs" role="tablist" aria-label={REPORT_VIEW_STRINGS.screenshotsHeading}>
              {report.screenshots.map((shot) => {
                const selected = shot.viewport === activeShot.viewport
                return (
                  <button
                    key={shot.viewport}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={`report-shots__tab${selected ? ' is-selected' : ''}`}
                    onClick={() => onViewport(shot.viewport)}
                  >
                    {REPORT_VIEW_STRINGS.viewportLabels[shot.viewport]}
                  </button>
                )
              })}
            </div>
            <div className="report-shots__frame" role="tabpanel">
              <img
                className="report-shots__image"
                src={activeShot.dataUrl}
                width={activeShot.width}
                height={activeShot.height}
                alt={`${REPORT_VIEW_STRINGS.viewportLabels[activeShot.viewport]} 스크린샷`}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Checklist grouped by category, fail-first ─────────── */}
      <div className="report-section">
        <h3 className="report-section__title">{REPORT_VIEW_STRINGS.checklistHeading}</h3>
        <div className="report-checklist">
          {report.categories.map((category) => (
            <div key={category.id} className="report-check-group">
              <h4 className="report-check-group__title">{category.label}</h4>
              <ul className="report-check-list">
                {sortChecksFailFirst(category.checks).map((check) => (
                  <li key={check.id} className="report-check" data-status={check.status}>
                    <div className="report-check__head">
                      <span className={`grader-badge grader-badge--${CHECK_STATUS_BADGE[check.status]}`}>
                        {CHECK_STATUS_LABELS[check.status]}
                      </span>
                      <span className="report-check__label">{check.label}</span>
                    </div>
                    <p className="report-check__message">{check.message}</p>
                    {check.tip ? (
                      <p className="report-check__tip">
                        {REPORT_VIEW_STRINGS.tipLabel}: {check.tip}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* ── AI axis comments (done only) ──────────────────────── */}
      {report.llmAxes && report.llmAxes.length > 0 ? (
        <div className="report-section">
          <h3 className="report-section__title">{REPORT_VIEW_STRINGS.aiCommentsHeading}</h3>
          <div className="report-comments">
            {report.llmAxes.map((axis) => (
              <div key={axis.id} className="grader-card report-comment">
                <p className="report-comment__axis">{axis.label}</p>
                <p className="report-comment__text">{axis.comment}</p>
                {axis.suggestions.length > 0 ? (
                  <ul className="report-comment__suggestions">
                    {axis.suggestions.map((suggestion, index) => (
                      <li key={index} className="report-comment__suggestion">
                        {REPORT_VIEW_STRINGS.suggestionLabel}: {suggestion}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Markdown download ─────────────────────────────────── */}
      <div className="report-actions">
        <span className="control-help">
          <button type="button" className="btn btn--primary" onClick={handleDownload}>
            {REPORT_VIEW_STRINGS.download}
          </button>
          <InfoTooltip entry={CONTROL_HELP.markdownDownload} />
        </span>
      </div>
    </section>
  )
}

/** Clamps a score/max ratio to a 0–100 integer percentage for the gauge fill. */
function percent(value: number, max: number): number {
  if (max <= 0) return 0
  const ratio = (value / max) * 100
  return Math.max(0, Math.min(100, Math.round(ratio)))
}
