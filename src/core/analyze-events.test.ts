/**
 * Tests for the client-side NDJSON stream reader {@link readAnalyzeStream}.
 *
 * The reader must reconstruct whole {@link StageEvent}s from an arbitrary byte
 * chunking: newline boundaries that fall mid-chunk, a multi-byte character split
 * across chunks, blank/trailing lines, and an unterminated final line. It must
 * also fail loudly on a body-less response or a corrupt line. These are all
 * exercised with a hand-built web `ReadableStream`, no network.
 */
import { describe, expect, it } from 'vitest'
import { readAnalyzeStream, type AnalyzeStreamResponse } from './analyze-events'
import {
  resultEvent,
  serializeEvent,
  stageEvent,
  type StageEvent,
} from '../server/stage-events'
import type { LoadErrorReport } from './report'

/** A minimal error-load report to serialise into a terminal `result` line. */
const errorReport: LoadErrorReport = {
  outcome: 'error-load',
  url: 'https://example.com',
  message: '페이지를 불러오지 못했습니다: 사설 네트워크 주소는 차단됩니다.',
}

/** Builds a response whose body streams `bytes` in fixed-size chunks. */
function streamingResponse(
  bytes: Uint8Array,
  chunkSize: number,
): AnalyzeStreamResponse {
  let offset = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize))
      offset += chunkSize
    },
  })
  return { body }
}

/** Collects every event yielded by the reader into an array. */
async function collect(response: AnalyzeStreamResponse): Promise<StageEvent[]> {
  const events: StageEvent[] = []
  for await (const event of readAnalyzeStream(response)) events.push(event)
  return events
}

describe('readAnalyzeStream', () => {
  const wire =
    serializeEvent(stageEvent('load')) +
    serializeEvent(stageEvent('audit')) +
    serializeEvent(stageEvent('ai')) +
    serializeEvent(stageEvent('error-load')) +
    serializeEvent(resultEvent(errorReport))
  const bytes = new TextEncoder().encode(wire)

  it('yields every event in order when the whole stream is one chunk', async () => {
    const events = await collect(streamingResponse(bytes, bytes.length))
    expect(events.map((e) => (e.type === 'stage' ? e.stage : 'result'))).toEqual([
      'load',
      'audit',
      'ai',
      'error-load',
      'result',
    ])
  })

  it('reassembles events across arbitrary byte-chunk boundaries', async () => {
    // A tiny chunk size splits lines (and the multi-byte Korean message) apart.
    const events = await collect(streamingResponse(bytes, 3))
    expect(events).toHaveLength(5)
    const terminal = events[4]
    expect(terminal.type).toBe('result')
    if (terminal.type === 'result') {
      expect(terminal.result).toEqual(errorReport)
    }
  })

  it('yields the final line even when it has no trailing newline', async () => {
    const unterminated = new TextEncoder().encode(
      serializeEvent(stageEvent('load')) + JSON.stringify(stageEvent('audit')),
    )
    const events = await collect(streamingResponse(unterminated, 4))
    expect(events.map((e) => (e.type === 'stage' ? e.stage : 'result'))).toEqual([
      'load',
      'audit',
    ])
  })

  it('skips blank lines produced by extra newlines', async () => {
    const padded = new TextEncoder().encode(
      `\n${serializeEvent(stageEvent('load'))}\n\n${serializeEvent(
        stageEvent('audit'),
      )}\n`,
    )
    const events = await collect(streamingResponse(padded, padded.length))
    expect(events).toHaveLength(2)
  })

  it('throws when the response carries no body stream', async () => {
    await expect(collect({ body: null })).rejects.toThrow(/no body stream/)
  })

  it('throws loudly on a corrupt line rather than yielding garbage', async () => {
    const corrupt = new TextEncoder().encode('{"type":"stage"}\nnot json\n')
    await expect(collect(streamingResponse(corrupt, corrupt.length))).rejects.toThrow()
  })
})
