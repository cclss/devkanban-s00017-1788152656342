/**
 * The Express HTTP edge for the landing-page grader.
 *
 * This is the single monolithic server: it serves the built SPA (from `dist/`)
 * and exposes `POST /api/analyze`, the one dynamic endpoint. The route is a thin
 * boundary — it validates the request shape, then hands off to the separated
 * analysis pipeline ({@link streamAnalysis}) and pushes each {@link StageEvent}
 * to the response as an NDJSON line so the browser can drive the progress
 * stepper live. All analysis logic (SSRF guard, load/audit/ai stages, grading)
 * lives behind that pipeline; this module owns only the HTTP wiring.
 *
 * Security invariants enforced here:
 * - **The API key never reaches a log.** The request-line log records only the
 *   method and the target URL; the key is passed straight into the pipeline and
 *   is never interpolated into any `logger.log` / `logger.error` call. A test
 *   asserts the key string is absent from all captured output, even on failure.
 * - **SSRF / bad-URL fail into `error-load`.** The pipeline's load stage runs
 *   the URL through the SSRF guard before any fetch; a private/loopback target
 *   or an unparseable URL is streamed back as a terminal `error-load` event plus
 *   a Korean error report — this edge does not need to re-implement that check.
 *
 * `createApp` takes injectable {@link AnalysisDeps} and a logger so the whole
 * endpoint is unit-testable over an ephemeral loopback port with a mocked fetch
 * and AI evaluator — no real network, per the grain Done-when.
 *
 * Boundary: backend HTTP edge (`src/server/`). It composes Express, the
 * `analysis-pipeline`, and static file serving; it holds no analysis logic.
 */
import path from 'node:path'
import express, { type Express } from 'express'
import {
  streamAnalysis,
  type AnalysisDeps,
  type AnalysisRequest,
} from './analysis-pipeline'

/** A minimal logger surface, so tests can capture output instead of the console. */
export type AppLogger = Pick<Console, 'log' | 'error'>

/** Options for {@link createApp}. */
export interface CreateAppOptions {
  /**
   * Directory of built static assets to serve (the SPA). Defaults to `dist/`
   * under the current working directory.
   */
  staticDir?: string
  /** Injectable pipeline dependencies (fetch, SSRF resolver, AI evaluator, clock). */
  deps?: AnalysisDeps
  /** Logger for request lines and errors. Defaults to the global `console`. */
  logger?: AppLogger
}

/** Content type for the newline-delimited JSON analysis stream. */
const NDJSON_CONTENT_TYPE = 'application/x-ndjson; charset=utf-8'

/**
 * Reads a field as a trimmed non-empty string, or `undefined`. Used to sanitise
 * the optional request fields (never throws on a malformed body).
 */
function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * Builds the Express app: the `POST /api/analyze` NDJSON stream plus static SPA
 * serving with a history-API fallback. Pure factory — it binds no port, so the
 * entry point ({@link file://./index.ts}) and the tests both drive it.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express()
  const logger = options.logger ?? console
  const staticDir =
    options.staticDir ?? path.resolve(process.cwd(), 'dist')

  app.use(express.json({ limit: '2mb' }))

  app.post('/api/analyze', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>
    const url = body.url

    // Edge validation: the URL must at least be a non-empty string. Its
    // http(s)/SSRF validity is enforced by the pipeline's load stage, which
    // streams `error-load` for a bad or private-network URL.
    if (typeof url !== 'string' || url.trim() === '') {
      res.status(400).json({ error: 'a non-empty "url" string is required' })
      return
    }

    // Request log — method + target URL ONLY. The API key is never logged.
    logger.log(`POST /api/analyze url=${url}`)

    const request: AnalysisRequest = {
      url,
      apiKey: optionalString(body.apiKey),
      provider: optionalString(body.provider),
      model: optionalString(body.model),
    }

    res.status(200)
    res.setHeader('Content-Type', NDJSON_CONTENT_TYPE)
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    // Disable proxy buffering so stage events reach the browser as they happen.
    res.setHeader('X-Accel-Buffering', 'no')

    try {
      await streamAnalysis(request, (line) => res.write(line), options.deps)
    } catch (error) {
      // Contain any unexpected pipeline error. Log the message only — never the
      // request body — so the key cannot leak into the error path either.
      const detail = error instanceof Error ? error.message : String(error)
      logger.error(`analyze pipeline error: ${detail}`)
    } finally {
      res.end()
    }
  })

  // Serve the built SPA assets.
  app.use(express.static(staticDir))

  // History-API fallback: any non-API GET returns index.html so client-side
  // routing works on a fresh load. A path-pattern-free middleware avoids the
  // Express-version wildcard-syntax pitfalls.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(staticDir, 'index.html'))
  })

  return app
}
