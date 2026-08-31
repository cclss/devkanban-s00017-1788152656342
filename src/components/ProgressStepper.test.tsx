// @vitest-environment jsdom
/**
 * Behaviour tests for {@link ProgressStepper} (grain-5).
 *
 * Covers the stage→step colouring rules the grain owns, through the public
 * surface only (`stage` in; the pure {@link stepStatus} helper and the rendered
 * class names out):
 * - Happy-path walk: the current in-progress stage's step is `is-active`, earlier
 *   steps are `is-done`; `done` marks all four `is-done`.
 * - Partial result (`done-partial`): the AI step fails (`is-error`) while the
 *   report step still completes (`is-done`).
 * - Load failure (`error-load`): the load step gets the failure class and no
 *   later step starts.
 *
 * jsdom is opted into per-file so the React-free core suite keeps its fast
 * `node` environment.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import ProgressStepper, {
  PROGRESS_STEPS,
  PROGRESS_STEPPER_LABEL,
  stepStatus,
  type ProgressStepId,
  type StepStatus,
} from './ProgressStepper'
import type { Stage } from '../state/stage'

afterEach(cleanup)

const STEP_IDS: readonly ProgressStepId[] = ['load', 'audit', 'ai', 'done']

/** Reads the class list of the step `<li>` for `stepId` from a rendered stepper. */
function stepClasses(container: HTMLElement, stepId: ProgressStepId): string[] {
  const el = container.querySelector<HTMLElement>(`li[data-step="${stepId}"]`)
  if (!el) throw new Error(`step "${stepId}" not rendered`)
  return Array.from(el.classList)
}

describe('stepStatus — stage → step matrix', () => {
  const CASES: Array<[Stage, Record<ProgressStepId, StepStatus>]> = [
    ['idle', { load: 'pending', audit: 'pending', ai: 'pending', done: 'pending' }],
    ['load', { load: 'active', audit: 'pending', ai: 'pending', done: 'pending' }],
    ['audit', { load: 'done', audit: 'active', ai: 'pending', done: 'pending' }],
    ['ai', { load: 'done', audit: 'done', ai: 'active', done: 'pending' }],
    ['done', { load: 'done', audit: 'done', ai: 'done', done: 'done' }],
    ['done-partial', { load: 'done', audit: 'done', ai: 'error', done: 'done' }],
    ['error-load', { load: 'error', audit: 'pending', ai: 'pending', done: 'pending' }],
  ]

  it.each(CASES)('assigns the expected status to every step in %s', (stage, expected) => {
    for (const id of STEP_IDS) {
      expect(stepStatus(stage, id)).toBe(expected[id])
    }
  })
})

describe('ProgressStepper — rendering', () => {
  it('renders the four phases in order with their Korean labels', () => {
    const { getByLabelText } = render(<ProgressStepper stage="idle" />)
    const list = getByLabelText(PROGRESS_STEPPER_LABEL)
    const items = Array.from(list.querySelectorAll('li[data-step]'))

    expect(items).toHaveLength(4)
    expect(items.map((el) => el.getAttribute('data-step'))).toEqual([
      'load',
      'audit',
      'ai',
      'done',
    ])
    expect(items.map((el) => el.textContent)).toEqual(
      PROGRESS_STEPS.map((step) => expect.stringContaining(step.label)),
    )
  })

  it('marks earlier steps is-done and the current stage step is-active while running', () => {
    const { container } = render(<ProgressStepper stage="ai" />)

    expect(stepClasses(container, 'load')).toContain('is-done')
    expect(stepClasses(container, 'audit')).toContain('is-done')
    expect(stepClasses(container, 'ai')).toContain('is-active')
    // The pending final step carries no state modifier.
    const doneClasses = stepClasses(container, 'done')
    expect(doneClasses).not.toContain('is-active')
    expect(doneClasses).not.toContain('is-done')
    expect(doneClasses).not.toContain('is-error')
  })

  it('sets aria-current="step" only on the active step', () => {
    const { container } = render(<ProgressStepper stage="audit" />)

    expect(
      container.querySelector('li[data-step="audit"]')?.getAttribute('aria-current'),
    ).toBe('step')
    expect(
      container.querySelectorAll('li[aria-current="step"]'),
    ).toHaveLength(1)
  })

  it('marks all four steps is-done in the done terminal stage', () => {
    const { container } = render(<ProgressStepper stage="done" />)
    for (const id of STEP_IDS) {
      expect(stepClasses(container, id)).toContain('is-done')
    }
    expect(container.querySelectorAll('li[aria-current="step"]')).toHaveLength(0)
  })

  it('marks the AI step is-error and the report step is-done in done-partial', () => {
    const { container } = render(<ProgressStepper stage="done-partial" />)

    expect(stepClasses(container, 'load')).toContain('is-done')
    expect(stepClasses(container, 'audit')).toContain('is-done')
    expect(stepClasses(container, 'ai')).toContain('is-error')
    expect(stepClasses(container, 'done')).toContain('is-done')
  })

  it('marks the load step is-error and leaves later steps pending on error-load', () => {
    const { container } = render(<ProgressStepper stage="error-load" />)

    expect(stepClasses(container, 'load')).toContain('is-error')
    for (const id of ['audit', 'ai', 'done'] as const) {
      const classes = stepClasses(container, id)
      expect(classes).not.toContain('is-active')
      expect(classes).not.toContain('is-done')
      expect(classes).not.toContain('is-error')
    }
  })
})
