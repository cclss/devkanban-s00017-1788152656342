# preview.toml (escape hatch)

`preview.toml` is an **optional** manifest at your project root that overrides
auto-detection. This is a floor, not a ceiling: it only declares **how to run
and deploy** your project. It says nothing about your stack, architecture,
patterns, or tests — those stay your choice.

## When you need it

Most projects need **no** `preview.toml`. The platform detects the framework,
build command, output directory, datastores, and required env automatically.
Add a manifest only when auto-detection is ambiguous or wrong:

- **Monorepo** — the runnable app lives in a subdirectory, not the repo root.
- **Non-standard build/run** — your build or start command isn't the framework default.
- **Custom output directory** — your built assets land somewhere other than the default.
- **Required env** — you want to declare keys the app must have to boot.
- **React Router v8 Framework Mode** (the stable successor to Remix v1/v2) —
  its Vite marker alone cannot distinguish SSR from SPA/static, and its output
  is `build/`, not the normal Vite `dist/`. Use the exact manifests in
  `stack-react-router-v8.md`.

When in doubt, leave it out and rely on the conventions in the other docs first.

## Location

A single file named `preview.toml` at the **project root**. If it is absent,
auto-detection runs normally. If it exists but has TOML syntax errors, the
manifest is **rejected** (fix the syntax or remove the file).

## Schema

Every field is optional unless noted. Declare only what you need to override.

```toml
# Top level
model  = "static"        # one of: "static" | "build-static" | "server"
target = "apps/web"      # subdirectory to run from (monorepo); omit for repo root

[build]
command = "npm run build"   # build step (for "build-static" / "server")

[serve]
command    = "node server.js"  # how to start the long-running server
port_env   = "PORT"            # name of the env var the server binds to (default: "PORT")
static_dir = "dist"            # directory of built static assets to serve

[db]
migrate = "npx prisma migrate deploy"  # idempotent, file-based migration command
seed    = "node seed.js"               # idempotent seed command; use `seed = false` to disable

[env]
API_KEY = { required = true }   # keys that must be present for the app to boot
```

### Field reference

- `model` — the run shape. `"static"` serves a directory as-is; `"build-static"`
  builds then serves the output directory; `"server"` runs a long-running process.
- `target` — directory the build/serve commands run in. Use for monorepos.
- `[build].command` — the build step. Used by `"build-static"` and `"server"`.
- `[serve].command` — how to start the server.
- `[serve].port_env` — the env var your server reads its listen port from
  (defaults to `PORT`). The platform injects this value; do not hardcode a port.
- `[serve].static_dir` — directory of built assets to serve directly.
- `[db].migrate` — a **file-based, idempotent** migration command.
- `[db].seed` — an **idempotent** seed command. Set `seed = false` to disable seeding.
- `[env].KEY = { required = true }` — KEY must be set or the app should fail to
  boot. Only entries with `required = true` are treated as required.

## Rules and gotchas

- **`model = "server"` requires `[serve].command`.** A server model without a
  serve command is **rejected**.
- **TOML syntax errors reject the whole manifest** — auto-detection will not run
  as a fallback. Validate your TOML.
- **Keep migrations and seeds idempotent.** They may run more than once on a
  fresh (green-field) start.
- **Re-sync on change.** Update `preview.toml` whenever your build command,
  start command, output directory, or required env change. A stale manifest
  breaks the run path.
