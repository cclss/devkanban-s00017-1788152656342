import { describe, it, expect } from 'vitest'
import {
  AUDIT_CATEGORY_IDS,
  AUDIT_CATEGORY_LABELS,
  AUDIT_MAX_SCORE,
  LLM_AXIS_IDS,
  LLM_AXIS_LABELS,
  LLM_MAX_SCORE,
  TOTAL_MAX_SCORE,
  type CheckStatus,
} from './report'
import {
  doneReport,
  donePartialReport,
  errorLoadReport,
} from './__fixtures__/report-fixtures'

const CHECK_STATUSES: readonly CheckStatus[] = ['pass', 'warn', 'fail', 'skip']

describe('report constants', () => {
  it('sums the auto-audit and AI maxima to the total scale', () => {
    expect(AUDIT_MAX_SCORE + LLM_MAX_SCORE).toBe(TOTAL_MAX_SCORE)
  })

  it('labels every audit category id and lists all five', () => {
    expect(AUDIT_CATEGORY_IDS).toHaveLength(5)
    for (const id of AUDIT_CATEGORY_IDS) {
      expect(AUDIT_CATEGORY_LABELS[id]).toBeTruthy()
    }
  })

  it('labels every AI axis id and lists all three', () => {
    expect(LLM_AXIS_IDS).toHaveLength(3)
    for (const id of LLM_AXIS_IDS) {
      expect(LLM_AXIS_LABELS[id]).toBeTruthy()
    }
  })
})

describe('done fixture (full 100-point report)', () => {
  it('is a complete report on the 100-point scale', () => {
    expect(doneReport.outcome).toBe('done')
    expect(doneReport.score.max).toBe(TOTAL_MAX_SCORE)
    expect(doneReport.score.grade).not.toBe('pending')
    expect(doneReport.score.llmScore).not.toBeNull()
  })

  it('covers all five audit categories in canonical order', () => {
    expect(doneReport.categories.map((c) => c.id)).toEqual([...AUDIT_CATEGORY_IDS])
  })

  it('covers all three AI axes in canonical order', () => {
    expect(doneReport.llmAxes?.map((a) => a.id)).toEqual([...LLM_AXIS_IDS])
  })

  it('exercises every check status somewhere in the report', () => {
    const seen = new Set(
      doneReport.categories.flatMap((c) => c.checks.map((k) => k.status)),
    )
    for (const status of CHECK_STATUSES) {
      expect(seen.has(status)).toBe(true)
    }
  })

  it('attaches a tip to every actionable (warn/fail) check', () => {
    for (const category of doneReport.categories) {
      for (const check of category.checks) {
        if (check.status === 'warn' || check.status === 'fail') {
          expect(check.tip).toBeTruthy()
        }
      }
    }
  })

  it('has both desktop and mobile screenshots with data URLs', () => {
    const viewports = doneReport.screenshots.map((s) => s.viewport)
    expect(viewports).toContain('desktop')
    expect(viewports).toContain('mobile')
    for (const shot of doneReport.screenshots) {
      expect(shot.dataUrl.startsWith('data:image/')).toBe(true)
    }
  })
})

describe('done-partial fixture (auto-audit only)', () => {
  it('drops the AI rubric and holds the grade', () => {
    expect(donePartialReport.outcome).toBe('done-partial')
    expect(donePartialReport.llmAxes).toBeNull()
    expect(donePartialReport.score.llmScore).toBeNull()
    expect(donePartialReport.score.grade).toBe('pending')
  })

  it('reports on the 60-point auto-audit scale', () => {
    expect(donePartialReport.score.max).toBe(AUDIT_MAX_SCORE)
    expect(donePartialReport.score.total).toBe(donePartialReport.score.auditScore)
  })

  it('carries a Korean reason for the partial result', () => {
    expect(donePartialReport.partialReason).toBeTruthy()
  })

  it('still shows all five audit categories', () => {
    expect(donePartialReport.categories.map((c) => c.id)).toEqual([
      ...AUDIT_CATEGORY_IDS,
    ])
  })
})

describe('error-load fixture (no report)', () => {
  it('carries a message instead of scores', () => {
    expect(errorLoadReport.outcome).toBe('error-load')
    expect(errorLoadReport.message).toBeTruthy()
    expect('score' in errorLoadReport).toBe(false)
  })

  it('exposes an optional status code', () => {
    expect(typeof errorLoadReport.statusCode).toBe('number')
  })
})
