// @vitest-environment jsdom
/**
 * React-binding tests for {@link useAnalyze}.
 *
 * `analyze-client.test.ts` covers the streaming transport in isolation; here we
 * verify the hook glue: a real run drives the stage machine live (mirrored to
 * `body[data-stage]`) and stores the terminal report, an `error-load` run stores
 * the error report, the in-progress conflict rule blocks a second start without
 * sending a request, and reset clears both stage and report.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useAnalyze } from './useAnalyze'
import { STAGE_ATTRIBUTE } from './useStage'
import type { FetchLike } from './analyze-client'
import {
  resultEvent,
  serializeEvent,
  stageEvent,
} from '../server/stage-events'
import type { AnalysisReport, LoadErrorReport } from '../core/report'

afterEach(() => {
  cleanup()
  document.body.removeAttribute(STAGE_ATTRIBUTE)
})

const doneReport: AnalysisReport = {
  outcome: 'done',
  url: 'https://example.com',
  analyzedAt: '2026-08-31T00:00:00.000Z',
  score: {
    total: 90,
    max: 100,
    grade: 'excellent',
    auditScore: 55,
    auditMax: 60,
    llmScore: 35,
    llmMax: 40,
  },
  categories: [],
  llmAxes: [],
  screenshots: [],
}

const errorReport: LoadErrorReport = {
  outcome: 'error-load',
  url: 'https://127.0.0.1',
  message: 'Failed to load the page: Private network addresses are blocked.',
}

function fetchStreaming(wire: string): FetchLike {
  return vi.fn(async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire))
        controller.close()
      },
    })
    return { ok: true, body } as unknown as Response
  })
}

describe('useAnalyze — real run', () => {
  it('drives the stage machine to done and stores the report', async () => {
    const wire =
      serializeEvent(stageEvent('load')) +
      serializeEvent(stageEvent('audit')) +
      serializeEvent(stageEvent('ai')) +
      serializeEvent(stageEvent('done')) +
      serializeEvent(resultEvent(doneReport))
    const { result } = renderHook(() => useAnalyze(fetchStreaming(wire)))

    let outcome!: ReturnType<typeof result.current.start>
    act(() => {
      outcome = result.current.start({ url: 'https://example.com' })
    })
    // Start succeeds and immediately enters `load`.
    expect(outcome.started).toBe(true)
    expect(result.current.stage).toBe('load')

    await waitFor(() => expect(result.current.stage).toBe('done'))
    expect(result.current.report).toEqual(doneReport)
    expect(document.body.getAttribute(STAGE_ATTRIBUTE)).toBe('done')
  })

  it('stores the error report and lands in error-load on a load failure', async () => {
    const wire =
      serializeEvent(stageEvent('load')) +
      serializeEvent(stageEvent('error-load')) +
      serializeEvent(resultEvent(errorReport))
    const { result } = renderHook(() => useAnalyze(fetchStreaming(wire)))

    act(() => {
      result.current.start({ url: 'https://127.0.0.1' })
    })

    await waitFor(() => expect(result.current.stage).toBe('error-load'))
    expect(result.current.report).toEqual(errorReport)
  })
})

describe('useAnalyze — conflict + reset', () => {
  it('refuses a start while a run is in progress and sends no request', () => {
    const fetchImpl = fetchStreaming('')
    const { result } = renderHook(() => useAnalyze(fetchImpl))

    // Enter an in-progress stage without a request.
    act(() => {
      result.current.transitionTo('load')
    })
    expect(result.current.stage).toBe('load')

    let outcome!: ReturnType<typeof result.current.start>
    act(() => {
      outcome = result.current.start({ url: 'https://example.com' })
    })

    expect(outcome.conflict).toBe(true)
    expect(outcome.started).toBe(false)
    expect(result.current.stage).toBe('load')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reset clears both the stage and the stored report', async () => {
    const wire =
      serializeEvent(stageEvent('load')) +
      serializeEvent(stageEvent('audit')) +
      serializeEvent(stageEvent('ai')) +
      serializeEvent(stageEvent('done')) +
      serializeEvent(resultEvent(doneReport))
    const { result } = renderHook(() => useAnalyze(fetchStreaming(wire)))

    act(() => {
      result.current.start({ url: 'https://example.com' })
    })
    await waitFor(() => expect(result.current.report).toEqual(doneReport))

    act(() => {
      result.current.reset()
    })
    expect(result.current.stage).toBe('idle')
    expect(result.current.report).toBeNull()
  })
})
