/**
 * Server entry point.
 *
 * Boots the monolithic Express app ({@link createApp}) and binds it to the
 * platform-injected `PORT` on `0.0.0.0`. Binding all interfaces (not loopback)
 * is required for the deployed container's health check to reach the process;
 * the port is always read from the environment — never hardcoded — so the same
 * build runs locally and in the platform.
 *
 * Boundary: process bootstrap only. All routing and analysis wiring lives in
 * `app.ts`; this file just listens.
 */
import { createApp } from './app'

/** Fallback port for a bare local run when `PORT` is not injected. */
const DEFAULT_PORT = 3000

const port = Number(process.env.PORT) || DEFAULT_PORT
const app = createApp()

app.listen(port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`landing-grader server listening on 0.0.0.0:${port}`)
})
