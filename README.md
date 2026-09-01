# Landing-page quality grader

A single-page web tool that scores a landing page before release. You enter one
URL and get, within about a minute, a hybrid quality report: a 60-point
automated audit (SEO / performance / mobile / security / accessibility) combined
with a 40-point AI rubric (visual / copy / CTA), plus concrete Korean
improvement tips. The product UI copy is Korean; this README (developer-facing)
is English.

The analysis streams live: the server walks a separated
`load → audit → ai → done` pipeline and emits one NDJSON stage event per
transition, so the browser's progress stepper updates in real time. If the AI
step fails (missing/invalid key, rate limit, parse error) the report still
completes on the 60-point auto-audit scale ("부분 결과 원칙"), so a release
decision is never blocked.

## Architecture

This is a **monolithic Node server on a single port**. The Express backend
(`src/server/`) serves both the built SPA and the one dynamic endpoint:

- `POST /api/analyze` — validates the request, runs the analysis pipeline, and
  streams the result as newline-delimited JSON (`application/x-ndjson`).
- Everything else — the built static SPA from `dist/`, with a history-API
  fallback to `index.html`.

| Role | Choice | Notes |
| --- | --- | --- |
| Build / framework | Vite + React + TypeScript | SPA built to Vite's default `dist/` |
| HTTP server | Express | Serves `dist/` + `POST /api/analyze`; run via `tsx` |
| Server runtime | tsx | Runs the TypeScript entry (`src/server/index.ts`) directly |
| Testing | Vitest | Unit + HTTP-edge tests, all network-free |

### Security invariants

- **SSRF guard.** Every target URL is checked before any fetch; private,
  loopback, link-local, and `localhost` targets are refused and streamed back as
  a terminal `error-load` event. Set `ALLOW_PRIVATE_NETWORK=true` to permit
  private targets for on-prem/internal testing (default: blocked).
- **The API key is never logged.** The key travels in the request body to drive
  the AI rubric but is never written to any request log, error message, or
  server console. This is covered by a test (`src/server/app.test.ts`).

## Configuration (environment variables)

All configuration comes from the environment — nothing is hardcoded, no secrets
are committed.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | no (defaults to `3000`) | Port the server binds on `0.0.0.0`. The platform injects it. |
| `ALLOW_PRIVATE_NETWORK` | no (default: unset = blocked) | `true`/`1`/`yes`/`on` permits private-network targets. |

The AI provider API key is **not** a server environment variable: users pick a
provider (Anthropic Claude or OpenAI GPT), choose a model, and enter the matching
key in the browser. The key is sent per request, never stored or logged
server-side.

## Running locally (green-field)

There is no database, seed data, or migration — nothing to provision. Starting
from a completely unconfigured checkout:

```bash
npm install      # install dependencies
npm run build    # type check (tsc -b) + build the SPA into dist/
npm start        # start the server (binds $PORT on 0.0.0.0, default :3000)
```

Then open the printed address (e.g. `http://localhost:3000`) — the server serves
the SPA and the `/api/analyze` endpoint on that one port.

### Frontend-only dev loop (optional)

For fast UI iteration with hot-reload, run the Vite dev server and the backend
side by side. Vite proxies `/api` to the Express server (default `:3000`):

```bash
npm start        # backend on :3000 (or $PORT)
npm run dev      # Vite dev server (default http://localhost:5173), proxies /api → backend
```

Set `PORT` for both processes if you use a non-default backend port; the Vite
proxy reads the same `PORT` value.

## Testing

```bash
npm test         # vitest run — unit + HTTP-edge tests, no real network
```

The HTTP-edge tests boot the Express app on an ephemeral loopback port and inject
mock fetch / DNS / AI boundaries, so the full request→NDJSON path is verified
without any outbound network call.

## Deployment

The app follows the platform run contract: single external port from `PORT`,
bound on `0.0.0.0`, backend serving the static frontend. The run shape is
declared in `preview.toml` (`model = "server"`, build `npm run build`, serve
`npm start`).
