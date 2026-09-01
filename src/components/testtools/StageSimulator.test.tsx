// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import StageSimulator, {
  CONFLICT_CHOICES,
  STAGE_CHOICES,
} from './StageSimulator'
import { CONTROL_HELP } from '../control-help'

afterEach(() => {
  cleanup()
})

function renderSimulator(overrides: Partial<Parameters<typeof StageSimulator>[0]> = {}) {
  render(
    <StageSimulator
      stage="idle"
      onForceStage={() => {}}
      conflictMode="none"
      onConflictModeChange={() => {}}
      {...overrides}
    />,
  )
}

describe('StageSimulator', () => {
  it('renders one button per forceable stage', () => {
    render(
      <StageSimulator
        stage="idle"
        onForceStage={() => {}}
        conflictMode="none"
        onConflictModeChange={() => {}}
      />,
    )
    for (const choice of STAGE_CHOICES) {
      expect(screen.getByRole('button', { name: choice.label })).toBeDefined()
    }
  })

  it('marks the current stage button active', () => {
    render(
      <StageSimulator
        stage="audit"
        onForceStage={() => {}}
        conflictMode="none"
        onConflictModeChange={() => {}}
      />,
    )
    const auditBtn = screen.getByRole('button', { name: '감사' })
    expect(auditBtn.getAttribute('aria-pressed')).toBe('true')
    const idleBtn = screen.getByRole('button', { name: '대기' })
    expect(idleBtn.getAttribute('aria-pressed')).toBe('false')
  })

  it('requests the forced stage on click', () => {
    const onForceStage = vi.fn()
    render(
      <StageSimulator
        stage="idle"
        onForceStage={onForceStage}
        conflictMode="none"
        onConflictModeChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '완료(정상)' }))
    expect(onForceStage).toHaveBeenCalledWith('done')
  })

  it('marks the current conflict mode active and requests a change on click', () => {
    const onConflictModeChange = vi.fn()
    render(
      <StageSimulator
        stage="idle"
        onForceStage={() => {}}
        conflictMode="none"
        onConflictModeChange={onConflictModeChange}
      />,
    )
    const [noneChoice, inProgressChoice] = CONFLICT_CHOICES
    expect(
      screen.getByRole('button', { name: noneChoice.label }).getAttribute('aria-pressed'),
    ).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: inProgressChoice.label }))
    expect(onConflictModeChange).toHaveBeenCalledWith('in-progress')
  })

  describe('per-control ⓘ help', () => {
    function helpTrigger(entry: { title: string }) {
      return screen.getByRole('button', { name: `Help: ${entry.title}` })
    }

    it('renders a ⓘ trigger for the stage-force and conflict groups', () => {
      renderSimulator()
      expect(helpTrigger(CONTROL_HELP.forceStage).getAttribute('aria-expanded')).toBe('false')
      expect(helpTrigger(CONTROL_HELP.conflictSim).getAttribute('aria-expanded')).toBe('false')
    })

    it('reveals the matching help body on activation, leaving force controls working', () => {
      const onForceStage = vi.fn()
      renderSimulator({ onForceStage })

      fireEvent.click(helpTrigger(CONTROL_HELP.forceStage))
      expect(screen.getByText(CONTROL_HELP.forceStage.body)).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: '완료(정상)' }))
      expect(onForceStage).toHaveBeenCalledWith('done')
    })
  })
})
