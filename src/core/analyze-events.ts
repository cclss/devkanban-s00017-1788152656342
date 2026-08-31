/**
 * Client-side reader for the `POST /api/analyze` NDJSON stage-event stream.
 *
 * The server streams the separated `load → audit → ai → done` pipeline as
 * newline-delimited JSON — one {@link StageEvent} per line (see the shared wire
 * contract). This module is the browser half: it turns a fetch `Response` body
 * (a byte {@link ReadableStream}) into an async iterable of parsed events, so
 * the state layer can drive the progress stepper live off `stage` events and
 * store the report off the terminal `result` event.
 *
 * The wire *contract* (the {@link StageEvent} shapes and the loud-failing
 * {@link parseEvent} line parser) is owned by one module — reused here rather
 * than re-declared — so the client and server can never disagree on the format.
 * That module is a pure, dependency-free contract (it imports only *types* from
 * the core/state layers and touches no Node globals), so referencing it from the
 * browser bundle adds no runtime coupling. This file adds only the streaming
 * decode-and-split reader on top of it.
 *
 * Boundary: React-free core module. It works against the standard web-streams
 * `ReadableStream` API (available in the browser and in Node's test runtime), so
 * it is unit-testable with a hand-built stream and needs no DOM.
 */
import {
  parseEvent,
  type StageEvent,
  type StageProgressEvent,
  type StageResultEvent,
} from '../server/stage-events'

export type { StageEvent, StageProgressEvent, StageResultEvent }
export { parseEvent }

/**
 * The subset of `Response` this reader needs: just the body byte stream. A real
 * fetch `Response` satisfies it; tests can supply a hand-built stream.
 */
export interface AnalyzeStreamResponse {
  /** The response body as a byte stream, or `null` when there is no body. */
  body: ReadableStream<Uint8Array> | null
}

/**
 * Reads `response.body` as an NDJSON stream and yields each {@link StageEvent}
 * as its line arrives.
 *
 * Bytes are decoded incrementally and split on `\n`; a partial trailing line is
 * buffered until the next chunk completes it, and any non-empty leftover after
 * the stream ends is parsed as the final record. Blank lines (e.g. a trailing
 * newline) are skipped. A malformed line makes {@link parseEvent} throw, so a
 * corrupt stream fails loudly rather than driving the UI with garbage.
 *
 * @throws Error when the response carries no body stream, or a line is not a
 * well-formed stage event.
 */
export async function* readAnalyzeStream(
  response: AnalyzeStreamResponse,
): AsyncGenerator<StageEvent> {
  const body = response.body
  if (body === null) {
    throw new Error('analyze response has no body stream to read')
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let newlineAt = buffer.indexOf('\n')
      while (newlineAt !== -1) {
        const line = buffer.slice(0, newlineAt)
        buffer = buffer.slice(newlineAt + 1)
        if (line.trim() !== '') yield parseEvent(line)
        newlineAt = buffer.indexOf('\n')
      }
    }

    // Flush any bytes the decoder was holding, then the final unterminated line.
    buffer += decoder.decode()
    const tail = buffer.trim()
    if (tail !== '') yield parseEvent(tail)
  } finally {
    reader.releaseLock()
  }
}
