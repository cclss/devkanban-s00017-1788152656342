# React frontends (Vite / CRA / Next / React Router v8)

These are **minimal run/deploy contracts** so the preview runtime can detect and serve
your app automatically. They do **not** constrain how you write components, structure
state, choose libraries, or test — that is all yours (floor, not ceiling).

Detection works by reading your dependencies and config — no manifest is needed for
the common Vite, CRA, and Next cases below. **React Router v8 Framework Mode
(the stable successor to Remix v1/v2) is the exception:** its Vite dependency
is ambiguous, so follow `stack-react-router-v8.md` and commit an explicit
`preview.toml`.

## Supported run shapes

Vite, CRA, and Next use their common auto-detected paths. React Router v8 is
supported through an explicit `preview.toml` because its Vite marker alone is
ambiguous:

| Framework | How it's detected | Build script | Served from |
|---|---|---|---|
| **Vite** | `vite` in dependencies | `build` script → | `dist/` |
| **Create React App** | `react-scripts` in dependencies | (works even without one) | `build/` |
| **Next (static export)** | `next` dep + `output: 'export'` in `next.config.*` | (detected by config) | `out/` |
| **Next (server / SSR)** | `next` dep + `output: 'standalone'` or default | built server process | single port |
| **React Router v8 Framework Mode** (successor to Remix v1/v2) | `@react-router/dev` + `react-router.config.*`; explicit manifest required | `react-router build` | `build/server` + `build/client` (SSR), or `build/client` (SPA/static) |

- **Vite / CRA / Next-export** build to a static directory; the runtime serves that
  directory directly. You do **not** write a server.
- **Next server (standalone or default)** runs as a long-lived process. It must bind to
  the `PORT` environment variable (see `networking.md`). The runtime builds and starts it
  for you; you don't hand-roll the start command for the standard layout.
- **React Router v8 Framework Mode** is one supported framework with two run
  shapes: SSR/BFF and SPA/static. It is the stable React framework successor to
  Remix v1/v2, but it is not the separate Remix 3 project. Read
  `stack-react-router-v8.md`; do not let generic Vite detection assume `dist/`.

Vite-style build-to-static projects are detected by their `build` script. CRA (from
`react-scripts`) and Next (from the `next` dependency plus its config) are recognized by
their dependency, so detection does not hinge on the `build` script name for them — though
Next still runs one to produce its output.

## Common failures

1. **SPA deep-link 404** — a client-routed SPA with no fallback breaks on direct visits
   to nested paths. Serve `index.html` for navigation requests (history-API fallback) so
   `/some/route` loads the app instead of returning 404.
2. **Secrets inlined into the client bundle** — build-time env values are baked into the
   shipped JS and visible to anyone. Only put non-secret, intentionally-public values in
   build-time variables; keep real secrets server-side (see `env-and-secrets.md`).
3. **Missing `build` script (Vite-style)** — a Vite-style build-to-static project with no
   standard `build` script is not detected and won't preview. Keep the conventional script
   name. (CRA and Next are recognized by their dependency instead.)
4. **Customized output directory** — if you change the build output away from the
   framework default (`dist` / `build` / `out`), detection looks in the wrong place.
   Either keep the default, or declare it explicitly in `preview.toml` (see
   `preview-toml.md`).
5. **React Router treated as plain Vite** — Framework Mode builds to `build/`, not
   Vite's normal `dist/`. Declare the server or static shape in `preview.toml` as
   shown in `stack-react-router-v8.md`.

## Checklist

- [ ] Standard `build` script in `package.json` (Vite-style; CRA and Next are recognized by their dependency).
- [ ] Build output left at the framework default, **or** declared in `preview.toml`.
- [ ] SPA serves `index.html` as a fallback for client routes.
- [ ] No secrets in build-time / client-side variables.
- [ ] Next: pick a mode explicitly — `output: 'export'` (static) vs `'standalone'`
      (server) — and for the server mode, bind to `PORT`.
- [ ] React Router v8: use Framework Mode, pick SSR or SPA/static explicitly, and
      commit the matching `preview.toml`.
