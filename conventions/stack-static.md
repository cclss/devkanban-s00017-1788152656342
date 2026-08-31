# Static sites (HTML / CSS / JS)

Minimal run contract for a static site. This is a floor for getting a local
preview and a deploy to work — not a constraint on how you write your markup,
styles, tooling, or tests. Build whatever you want on top.

## What works

You do **not** need to write a server. The platform serves a static directory
directly. It is detected as static in either of these shapes:

- **Plain static**: `index.html` at the repository root, with assets referenced
  by **relative paths** (so they resolve behind a reverse proxy on any path).
- **Prebuilt output**: an `index.html` inside one of these directories at the
  root — `dist`, `build`, `out`, or `public`. Use the directory your tool
  produces by default; if you customize it to something else, declare it (see
  `preview-toml.md`).

That's it. Drop the files in and the preview comes up.

## SPA routing (deep links)

If your app does client-side routing, requests for routes other than `/`
(e.g. a refresh on `/dashboard`) must fall back to `index.html` or they 404.

How the runtime serves a static directory:

- A real file that matches the request path is served as-is (assets always win).
- A request for `/` always returns `index.html`.
- Any other **navigation** request — a `GET` whose `Accept` header includes
  `text/html` — also falls back to `index.html` when it exists.
- A missing **asset** (not a navigation request) returns `404`, so broken asset
  paths surface instead of being masked by the HTML.

So a normal SPA built into one of the output dirs above gets deep-link fallback
for free. You just need a real `index.html` in that directory. If you ship a
truly multi-page static site (no client routing), no fallback is needed — each
page is its own file.

## Common failures

1. **Adding a server you don't need.** A static site does not need a
   `server.js` / runtime entrypoint. Adding one changes how the project is
   detected and you lose the simple static path. Keep static sites static.
2. **No SPA fallback.** Client-routed app with no `index.html` to fall back to →
   deep links and refreshes 404. Ensure `index.html` exists in the served dir.
3. **Wrong output directory.** Build emits to a directory the runtime doesn't
   recognize (only `dist`, `build`, `out`, `public` are auto-detected). Either
   use one of those, or declare your directory in `preview.toml`.
4. **Absolute asset paths.** Assets pinned to an absolute host/URL break behind
   the proxy. Use relative paths.

## Checklist

- [ ] `index.html` is at the repo root, **or** inside `dist` / `build` / `out` /
      `public` (or your custom dir is declared in `preview.toml`).
- [ ] Assets use **relative** paths.
- [ ] No unnecessary server entrypoint for a static-only site.
- [ ] If it's an SPA, an `index.html` exists in the served directory so
      navigation requests fall back to it.

For ports, TLS, and proxy headers see `networking.md`; for non-standard builds
or monorepo targets see `preview-toml.md`.
