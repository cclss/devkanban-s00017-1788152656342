// `vitest/config` re-exports Vite's defineConfig with the `test` field typed.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Static SPA build. Output stays at the Vite default `dist/`
// so the preview runtime auto-detects it (see conventions/stack-frontend-react.md).
export default defineConfig({
  plugins: [react()],
  // Core logic (`src/core/`) is React-independent and unit tested with Vitest
  // under the fast default `node` environment. Component smoke tests (`.tsx`)
  // opt into jsdom per-file via a `@vitest-environment jsdom` docblock, so they
  // don't slow the core suite down.
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
