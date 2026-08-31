// @vitest-environment jsdom
/**
 * React-binding tests for {@link useStage}.
 *
 * `stage.test.ts` already covers the pure transition rules. The behaviour that
 * only lives in the hook — mirroring the current stage onto `document.body`'s
 * `data-stage` attribute and clearing it on unmount, plus that the guarded
 * actions only mutate state on legal moves — is verified here with `renderHook`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { STAGE_ATTRIBUTE, useStage } from './useStage'

afterEach(() => {
  cleanup()
  document.body.removeAttribute(STAGE_ATTRIBUTE)
})

function bodyStage(): string | null {
  return document.body.getAttribute(STAGE_ATTRIBUTE)
}

describe('useStage — body[data-stage] reflection', () => {
  it('reflects the initial stage onto body on mount', () => {
    renderHook(() => useStage())
    expect(bodyStage()).toBe('idle')
  })

  it('honours a non-default initial stage', () => {
    const { result } = renderHook(() => useStage('done'))
    expect(result.current.stage).toBe('done')
    expect(bodyStage()).toBe('done')
  })

  it('updates body[data-stage] as the stage changes', () => {
    const { result } = renderHook(() => useStage())

    act(() => {
      result.current.start()
    })
    expect(result.current.stage).toBe('load')
    expect(bodyStage()).toBe('load')

    act(() => {
      result.current.transitionTo('audit')
    })
    expect(bodyStage()).toBe('audit')
  })

  it('clears body[data-stage] on unmount', () => {
    const { unmount } = renderHook(() => useStage('load'))
    expect(bodyStage()).toBe('load')
    unmount()
    expect(bodyStage()).toBeNull()
  })
})

describe('useStage — guarded actions', () => {
  it('start from idle enters load and reports it started', () => {
    const { result } = renderHook(() => useStage())
    let outcome!: ReturnType<typeof result.current.start>
    act(() => {
      outcome = result.current.start()
    })
    expect(outcome).toEqual({ stage: 'load', started: true, conflict: false })
    expect(result.current.stage).toBe('load')
    expect(result.current.inProgress).toBe(true)
  })

  it('start while in progress is a conflict and does not move', () => {
    const { result } = renderHook(() => useStage('audit'))
    let outcome!: ReturnType<typeof result.current.start>
    act(() => {
      outcome = result.current.start()
    })
    expect(outcome).toEqual({ stage: 'audit', started: false, conflict: true })
    expect(result.current.stage).toBe('audit')
    expect(bodyStage()).toBe('audit')
  })

  it('start from a terminal restarts a fresh run', () => {
    const { result } = renderHook(() => useStage('done-partial'))
    act(() => {
      result.current.start()
    })
    expect(result.current.stage).toBe('load')
    expect(bodyStage()).toBe('load')
  })

  it('transitionTo applies a legal move and reports true', () => {
    const { result } = renderHook(() => useStage('load'))
    let applied = false
    act(() => {
      applied = result.current.transitionTo('error-load')
    })
    expect(applied).toBe(true)
    expect(result.current.stage).toBe('error-load')
    expect(result.current.terminal).toBe(true)
  })

  it('transitionTo ignores an illegal move and reports false', () => {
    const { result } = renderHook(() => useStage('idle'))
    let applied = true
    act(() => {
      applied = result.current.transitionTo('done')
    })
    expect(applied).toBe(false)
    expect(result.current.stage).toBe('idle')
    expect(bodyStage()).toBe('idle')
  })

  it('reset returns a terminal stage to idle', () => {
    const { result } = renderHook(() => useStage('done'))
    act(() => {
      result.current.reset()
    })
    expect(result.current.stage).toBe('idle')
    expect(bodyStage()).toBe('idle')
  })
})
