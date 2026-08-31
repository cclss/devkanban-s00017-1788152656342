// `vitest/config` re-exports Vite's defineConfig with the `test` field typed.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Static SPA build. Output stays at the Vite default `dist/`
// so the preview runtime auto-detects it (see conventions/stack-frontend-react.md).
export default defineConfig({
  plugins: [react()],
  // In dev, the SPA runs on Vite while `POST /api/analyze` is served by the
  // Express backend (`npm start`, default :3000). Proxy `/api` there so the
  // browser talks to one origin and no CORS is needed; in production the same
  // Express server serves both the built SPA and the API on a single port.
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT ?? 3000}`,
        changeOrigin: true,
      },
    },
  },
  // Core logic (`src/core/`) is React-independent and unit tested with Vitest
  // under the fast default `node` environment. Component smoke tests (`.tsx`)
  // opt into jsdom per-file via a `@vitest-environment jsdom` docblock, so they
  // don't slow the core suite down.
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
