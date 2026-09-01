// @vitest-environment jsdom
/**
 * Behaviour tests for {@link ReportView} (grain-6).
 *
 * Covers the three terminal branches (Design §상태 전이 규칙) and the markdown
 * download trigger, driven only through the public `report` prop:
 * - `done`: full report — total gauge, grade badge, category + AI score cards,
 *   screenshot tabs, checklist, AI comments, download button.
 * - `done-partial`: 60-point scale note + "등급 보류" grade, AI cards/comments
 *   replaced by the Korean partial-result notice; categories/checklist stay.
 * - `error-load`: the whole report is hidden, only the Korean error card shows.
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
    expect(screen.getByText('양호')).toBeDefined()
  })

  it('renders all five category and three AI score cards, and AI comments', () => {
    render(<ReportView report={doneReport} />)
    for (const label of ['SEO', '성능', '모바일', '보안', '접근성']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    for (const axis of ['비주얼', '카피', 'CTA']) {
      expect(screen.getAllByText(axis).length).toBeGreaterThan(0)
    }
    // AI comment text is present (done only).
    expect(
      screen.getByText('여백과 타이포그래피의 위계가 명확해 첫인상이 깔끔합니다.'),
    ).toBeDefined()
  })

  it('orders checks fail-first within a category group', () => {
    render(<ReportView report={doneReport} />)
    // The performance group has fail → warn → pass.
    const failCheck = screen.getByText('이미지 최적화').closest('.report-check')
    const passCheck = screen.getByText('텍스트 압축').closest('.report-check')
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
      `${REPORT_VIEW_STRINGS.viewportLabels.mobile} 스크린샷`,
    )
  })
})

describe('ReportView — done-partial (60-point scale)', () => {
  it('shows the 60-point max, the 등급 보류 badge, and the partial notice instead of AI', () => {
    render(<ReportView report={donePartialReport} />)
    const meter = screen.getByRole('meter')
    expect(meter).toHaveProperty('ariaValueMax', '60')
    expect(screen.getByText(REPORT_VIEW_STRINGS.partialScaleNote)).toBeDefined()
    expect(screen.getByText('등급 보류')).toBeDefined()

    // AI score cards and comments are gone; the Korean reason is shown.
    expect(screen.queryByText('비주얼')).toBeNull()
    expect(
      screen.getByText('AI 평가 결과 없음: API 키 오류로 자동 점검 결과만 표시합니다.'),
    ).toBeDefined()

    // Categories/checklist are still present.
    expect(screen.getAllByText('SEO').length).toBeGreaterThan(0)
  })
})

describe('ReportView — error-load', () => {
  it('hides the report and shows only the Korean error card with status code', () => {
    render(<ReportView report={errorLoadReport} />)
    expect(screen.getByText(errorLoadReport.message)).toBeDefined()
    expect(screen.getByText(/상태 코드: 400/)).toBeDefined()

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
    '사설 네트워크·localhost·링크로컬 주소는 SSRF 보호를 위해 차단됩니다. 외부에서 접근 가능한 공개 URL을 입력하세요.'
  const PARTIAL_DETAIL =
    '입력한 API 키가 공급자에서 거부되었습니다. 키 값이 정확한지, 선택한 모델을 사용할 권한이 있는지 확인한 뒤 다시 진단하세요.'

  it('shows a "자세히 보기" disclosure with the load-failure detail', () => {
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
