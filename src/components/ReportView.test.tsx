// @vitest-environment jsdom
/**
 * Behaviour tests for {@link ReportView} (grain-6).
 *
 * Covers the three terminal branches (Design §state-transition rules) and the
 * markdown download trigger, driven only through the public `report` prop:
 * - `done`: full report — total gauge, grade badge, category + AI score cards,
 *   screenshot tabs, checklist, AI comments, download button.
 * - `done-partial`: 60-point scale note + "Grade withheld" grade, AI cards/comments
 *   replaced by the English partial-result notice; categories/checklist stay.
 * - `error-load`: the whole report is hidden, only the English error card shows.
 * - Download: clicking the button hands `downloadBlob` a Blob and the
 *   `landing-report-…md` filename (SC-2).
 *
 * jsdom is opted into per-file so the React-free core suite keeps its fast
 * `node` environment.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

// Mock the byte-download boundary so the trigger is observable without a real
// download; the markdown/filename builders stay real (covered by their own suite).
const downloadBlob = vi.fn()
vi.mock('../core/download', () => ({
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}))

import ReportView, { REPORT_VIEW_STRINGS } from './ReportView'
import { CONTROL_HELP } from './control-help'
import {
  doneReport,
  donePartialReport,
  errorLoadReport,
} from '../core/__fixtures__/report-fixtures'

afterEach(() => {
  cleanup()
  downloadBlob.mockClear()
})

describe('ReportView — null / no result', () => {
  it('renders nothing when there is no terminal report', () => {
    const { container } = render(<ReportView report={null} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('ReportView — done (full report)', () => {
  it('shows the total on the 100-point scale and the grade badge', () => {
    render(<ReportView report={doneReport} />)
    const meter = screen.getByRole('meter')
    expect(meter).toHaveProperty('ariaValueNow', '84')
    expect(meter).toHaveProperty('ariaValueMax', '100')
    expect(screen.getByText('Good')).toBeDefined()
  })

  it('renders all five category and three AI score cards, and AI comments', () => {
    render(<ReportView report={doneReport} />)
    for (const label of ['SEO', 'Performance', 'Mobile', 'Security', 'Accessibility']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    for (const axis of ['Visual', 'Copy', 'CTA']) {
      expect(screen.getAllByText(axis).length).toBeGreaterThan(0)
    }
    // AI comment text is present (done only).
    expect(
      screen.getByText('Whitespace and typographic hierarchy are clear, giving a clean first impression.'),
    ).toBeDefined()
  })

  it('orders checks fail-first within a category group', () => {
    render(<ReportView report={doneReport} />)
    // The performance group has fail → warn → pass.
    const failCheck = screen.getByText('Image optimization').closest('.report-check')
    const passCheck = screen.getByText('Text compression').closest('.report-check')
    expect(failCheck).not.toBeNull()
    expect(passCheck).not.toBeNull()
    // Document order: the fail check appears before the pass check.
    expect(
      failCheck!.compareDocumentPosition(passCheck!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('switches the screenshot when a viewport tab is clicked', () => {
    render(<ReportView report={doneReport} />)
    const desktopTab = screen.getByRole('tab', { name: REPORT_VIEW_STRINGS.viewportLabels.desktop })
    const mobileTab = screen.getByRole('tab', { name: REPORT_VIEW_STRINGS.viewportLabels.mobile })
    expect(desktopTab).toHaveProperty('ariaSelected', 'true')

    fireEvent.click(mobileTab)
    expect(mobileTab).toHaveProperty('ariaSelected', 'true')
    expect(desktopTab).toHaveProperty('ariaSelected', 'false')
    expect(screen.getByRole('img')).toHaveProperty(
      'alt',
      `${REPORT_VIEW_STRINGS.viewportLabels.mobile} screenshot`,
    )
  })
})

describe('ReportView — done-partial (60-point scale)', () => {
  it('shows the 60-point max, the grade-withheld badge, and the partial notice instead of AI', () => {
    render(<ReportView report={donePartialReport} />)
    const meter = screen.getByRole('meter')
    expect(meter).toHaveProperty('ariaValueMax', '60')
    expect(screen.getByText(REPORT_VIEW_STRINGS.partialScaleNote)).toBeDefined()
    expect(screen.getByText('Grade withheld')).toBeDefined()

    // AI score cards and comments are gone; the English reason is shown.
    expect(screen.queryByText('Visual')).toBeNull()
    expect(
      screen.getByText('No AI evaluation results: an API key error means only the auto-audit results are shown.'),
    ).toBeDefined()

    // Categories/checklist are still present.
    expect(screen.getAllByText('SEO').length).toBeGreaterThan(0)
  })
})

describe('ReportView — evaluated without screenshots', () => {
  it('shows the "Evaluated without screenshots" notice in the AI section when omitted', () => {
    render(<ReportView report={{ ...doneReport, screenshotsOmitted: true }} />)
    expect(
      screen.getByText(REPORT_VIEW_STRINGS.screenshotsOmittedNotice),
    ).toBeDefined()
    // The AI axis cards still render — a text-only evaluation still scored.
    for (const axis of ['Visual', 'Copy', 'CTA']) {
      expect(screen.getAllByText(axis).length).toBeGreaterThan(0)
    }
  })

  it('omits the notice on a normal report that used the screenshots', () => {
    render(<ReportView report={doneReport} />)
    expect(
      screen.queryByText(REPORT_VIEW_STRINGS.screenshotsOmittedNotice),
    ).toBeNull()
  })
})

describe('ReportView — error-load', () => {
  it('hides the report and shows only the English error card with status code', () => {
    render(<ReportView report={errorLoadReport} />)
    expect(screen.getByText(errorLoadReport.message)).toBeDefined()
    expect(screen.getByText(/Status code: 400/)).toBeDefined()

    // None of the report surfaces render.
    expect(screen.queryByRole('meter')).toBeNull()
    expect(
      screen.queryByRole('button', { name: REPORT_VIEW_STRINGS.download }),
    ).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
  })
})

describe('ReportView — failure detail disclosure', () => {
  const LOAD_DETAIL =
    'Private-network, localhost, and link-local addresses are blocked for SSRF protection. Enter a publicly reachable URL.'
  const PARTIAL_DETAIL =
    'The API key you entered was rejected by the provider. Check that the key value is correct and that you have permission to use the selected model, then run the diagnosis again.'

  it('shows a "View details" disclosure with the load-failure detail', () => {
    render(<ReportView report={{ ...errorLoadReport, detail: LOAD_DETAIL }} />)
    // Headline message is still shown, and the detail is available in the DOM.
    expect(screen.getByText(errorLoadReport.message)).toBeDefined()
    expect(screen.getByText(REPORT_VIEW_STRINGS.detailToggle)).toBeDefined()
    expect(screen.getByText(LOAD_DETAIL)).toBeDefined()
  })

  it('shows the partial-result detail behind the same disclosure', () => {
    render(
      <ReportView report={{ ...donePartialReport, partialDetail: PARTIAL_DETAIL }} />,
    )
    expect(screen.getByText(donePartialReport.partialReason!)).toBeDefined()
    expect(screen.getByText(REPORT_VIEW_STRINGS.detailToggle)).toBeDefined()
    expect(screen.getByText(PARTIAL_DETAIL)).toBeDefined()
  })

  it('omits the disclosure when no detail is present', () => {
    // The confirmed fixtures carry no detail, so nothing to expand.
    render(<ReportView report={errorLoadReport} />)
    expect(screen.queryByText(REPORT_VIEW_STRINGS.detailToggle)).toBeNull()
    cleanup()
    render(<ReportView report={donePartialReport} />)
    expect(screen.queryByText(REPORT_VIEW_STRINGS.detailToggle)).toBeNull()
  })

  it('surfaces the provider status code and masked summary in the failure details', () => {
    const secret = 'sk-super-secret-value-abc123'
    render(
      <ReportView
        report={{
          ...donePartialReport,
          partialStatusCode: 404,
          partialSummary: 'HTTP 404: model claude-does-not-exist not found',
        }}
      />,
    )
    // The disclosure opens even without a detail, because provider metadata exists.
    expect(screen.getByText(REPORT_VIEW_STRINGS.detailToggle)).toBeDefined()
    expect(
      screen.getByText(`${REPORT_VIEW_STRINGS.providerStatusLabel}: 404`),
    ).toBeDefined()
    expect(
      screen.getByText(
        `${REPORT_VIEW_STRINGS.providerSummaryLabel}: HTTP 404: model claude-does-not-exist not found`,
      ),
    ).toBeDefined()
    // No API key ever reaches the DOM.
    expect(document.body.textContent).not.toContain(secret)
  })
})

describe('ReportView — markdown download', () => {
  it('hands downloadBlob a Blob and the landing-report filename', () => {
    render(<ReportView report={doneReport} />)
    fireEvent.click(
      screen.getByRole('button', { name: REPORT_VIEW_STRINGS.download }),
    )

    expect(downloadBlob).toHaveBeenCalledTimes(1)
    const [blob, filename] = downloadBlob.mock.calls[0]
    expect(blob).toBeInstanceOf(Blob)
    expect(filename).toBe('landing-report-example.com-2026-08-31T090000.md')
  })

  it('is offered on a partial report too', () => {
    render(<ReportView report={donePartialReport} />)
    const button = screen.getByRole('button', { name: REPORT_VIEW_STRINGS.download })
    fireEvent.click(button)
    expect(downloadBlob).toHaveBeenCalledTimes(1)
  })
})

describe('ReportView — per-control ⓘ help', () => {
  function helpTrigger(entry: { title: string }) {
    return screen.getByRole('button', { name: `Help: ${entry.title}` })
  }

  it('renders a ⓘ trigger for the download button and the screenshot tabs', () => {
    render(<ReportView report={doneReport} />)
    expect(helpTrigger(CONTROL_HELP.markdownDownload).getAttribute('aria-expanded')).toBe('false')
    expect(helpTrigger(CONTROL_HELP.screenshotTabs).getAttribute('aria-expanded')).toBe('false')
  })

  it('reveals the matching help body on activation, leaving the download working', () => {
    render(<ReportView report={doneReport} />)

    fireEvent.click(helpTrigger(CONTROL_HELP.markdownDownload))
    expect(screen.getByText(CONTROL_HELP.markdownDownload.body)).toBeDefined()

    // The download control still fires with the help icon wired in.
    fireEvent.click(
      screen.getByRole('button', { name: REPORT_VIEW_STRINGS.download }),
    )
    expect(downloadBlob).toHaveBeenCalledTimes(1)
  })
})
