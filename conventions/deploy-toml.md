# Deploying to Hestia: `deploy.toml`

This is the **deploy-target** contract. `preview.toml` (see `preview-toml.md`)
tells the **local preview** runtime how to run your app; `deploy.toml` tells the
**Hestia** platform how to build, run, and route your app once it is published.
They are two separate files with two separate schemas — this doc is only about
`deploy.toml`. Floor, not ceiling: it constrains only build/run/routing, never
how you design your code.

Hestia builds your repo into a gVisor-isolated container per app and exposes it
behind a shared TLS terminator at `https://<appId>.<platform-domain>`.

## New projects: choose fallback or an explicit bundle

When your app is ready to ship, choose one complete path:

- Leave `deploy.toml` absent and use the fallback described below.
- For the canonical, auditable path, commit **`deploy.toml`, every referenced
  `Dockerfile`, and `.dockerignore` together**.

The presence of `deploy.toml` disables Hestia's Dockerfile generation. A partial
manifest — including a healthcheck-only file with no Dockerfile — therefore
fails preflight. Generate the explicit bundle from your app's shape (and your
`preview.toml`, if any) using the schema and mapping below. These are deploy
artifacts only; they do not touch your code, stack, or the BASELINE contract.

## Existing / no-manifest apps still deploy (fallback)

Apps **without** a `deploy.toml` are not stranded: Hestia falls back to your
`preview.toml` (when present) and then to language auto-detection, so a project
built on an earlier version of this template still deploys. Resolution order is
**`deploy.toml` → `preview.toml` → language auto-detection.** For the
no-manifest fallback to work, make sure of these (all already in the baseline,
called out here because Hestia enforces them):

- **Bind `0.0.0.0:$PORT`.** Not `127.0.0.1`, not a hardcoded port. In a deployed
  container the platform reaches you on the pod IP, so a loopback-only bind fails
  the health check. (`0.0.0.0` also works for local preview — prefer it always.)
- **Commit a lockfile.** `package-lock.json`/`pnpm-lock.yaml`/`yarn.lock`,
  `go.sum`, `Gemfile.lock`, `requirements.txt`(pinned)/`uv.lock`/`poetry.lock`,
  `Cargo.lock`, `mix.lock`. Deterministic installs are required — a missing
  lockfile fails the build.
- **Have a detectable start command.** Go / Rust / Java (fat jar) / Elixir (mix
  release) are inferred; **Node** needs a `"start"` script; **Ruby / Python /
  Elixir (non-release)** need a `Procfile` with a `web:` line, e.g.
  `web: gunicorn app:app --bind 0.0.0.0:$PORT`.
- **Non-root at build.** If you ship a Dockerfile, its final stage must set a
  non-root `USER` and pin the base image tag (see `deployment-docker.md`).

Auto-detected languages: **Go, Node, Python, Ruby, Java, Rust, Elixir.** If none
of these fit, or detection is ambiguous (multi-service, custom build, a database,
locked egress), write a `deploy.toml`.

## What Hestia injects (differs from local preview!)

Hestia injects a **smaller** set than the local preview runtime. Do not assume
the preview-only variables are present when deployed:

| Variable | Injected on Hestia? | Notes |
|---|---|---|
| `PORT` | ✅ always | bind `0.0.0.0:$PORT` |
| `DATABASE_URL` | ✅ when `database = true` | managed Postgres, one DB per app |
| `<NAME>_INTERNAL_URL` | ✅ multi-service | reach sibling service `name` (e.g. `API_INTERNAL_URL`) |
| your `env` bundle | ✅ | keys the caller passes at deploy time (sealed at rest) |
| `REDIS_URL` | ❌ **not managed** | Hestia provisions Postgres only. If you need a cache, run your own or pass a URL via env — do not assume it exists. |
| `SECRET_KEY_BASE`, `PHX_HOST`, `HOST`, `NODE_ENV`, `MIX_ENV` | ❌ **not auto-injected** | these are local-preview conveniences. On Hestia, supply what your app needs through the `env` bundle (e.g. a Phoenix app must be given `SECRET_KEY_BASE` and `PHX_HOST` as env). |

Isolation at runtime: non-root, read-only root filesystem (only `/tmp` is
writable), egress open by default but link-local metadata (`169.254.0.0/16`)
always blocked, cpu/memory/disk caps. Don't assume you can write outside `/tmp`.

## `deploy.toml` schema

Root of the repo, TOML. **Never include a `port` key** (rejected — the port is
always injected). Declare only what auto-detection can't infer.

**Top-level keys (whole app):**

| Key | Type | Default | Meaning |
|---|---|---|---|
| `database` | bool | `false` | `true` → provision Postgres + inject `DATABASE_URL` |
| `egress` | string[] | `[]` (open) | non-empty → **lock** outbound to exactly these domains (opt-in) |
| `migrate` | string | — | (single service) one-shot migration command, run once per deploy |
| `healthcheck` | string | `"/"` | (single service) path that must return 200 for the app to go live |
| `[[services]]` | table[] | auto (1 inferred) | **only when you have 2+ services** |

**`[[services]]` keys (multi-service only):**

| Key | Type | Default | Meaning |
|---|---|---|---|
| `name` | string | (required) | service id; also the subdomain label when `subdomain = true` (DNS label: lowercase, digits, hyphen) |
| `dockerfile` | string | `"./Dockerfile"` | this service's Dockerfile path |
| `public` | bool | `false` | serve at the app apex — **exactly one service** must be public |
| `subdomain` | bool | `false` | serve at `<appId>-<name>.<domain>`; **mutually exclusive** with `public`/`routes` |
| `routes` | string[] | — | path prefixes on the apex host (e.g. `["/api"]`); each must start with `/` and not overlap |
| `migrate` | string | — | this service's one-shot migration command |
| `healthcheck` | string | `"/"` | this service's health path |

Rules: single service is auto-published at the apex (`/`) — no `[[services]]`
needed. With 2+ services, exactly one is `public`; expose others via `routes` or
`subdomain`, or leave them internal (workers). Sibling services talk over
`<NAME>_INTERNAL_URL`, never `localhost:<port>`.

## `preview.toml` → `deploy.toml` mapping

If you already wrote a `preview.toml`, translate it like this:

| `preview.toml` | `deploy.toml` |
|---|---|
| `model = "static"` / `"build-static"` | serve a static build — ship a tiny static Dockerfile (see `deployment-docker.md`), single service, `public = true` |
| `model = "server"` + `[serve].command` | the container's `CMD` runs it; bind `0.0.0.0:$PORT` |
| `[serve].port_env` | not needed — Hestia always injects `PORT` (no `port` key in deploy.toml) |
| `target = "apps/web"` (monorepo) | build that subdir via each service's `dockerfile` path / build context |
| `[db].migrate` / `.seed` | top-level `migrate` (single) or per-service `migrate`; or run it from the container `CMD` |
| `[env].KEY = { required = true }` | pass required keys in the deploy-time `env` bundle; keep secrets out of git |

## Examples

**Single service, no DB** — usually no file is needed at all. If you want it
explicit, commit this **together with `./Dockerfile` and `.dockerignore`**:
```toml
# almost empty; a single service auto-publishes at the apex
healthcheck = "/healthz"
```

**Single backend with a database + migration + locked egress:**
```toml
database    = true
migrate     = "npx prisma migrate deploy"   # idempotent, file-based
egress      = ["api.openai.com"]            # optional: allow ONLY these domains
healthcheck = "/healthz"
```

**Frontend (apex) + API (path) + DB:**
```toml
database = true

[[services]]
name = "web"
dockerfile = "./web/Dockerfile"
public = true
routes = ["/"]

[[services]]
name = "api"
dockerfile = "./api/Dockerfile"
routes = ["/api"]
migrate = "npx prisma migrate deploy"
```

**Web + internal worker (worker not exposed):**
```toml
database = true

[[services]]
name = "web"
dockerfile = "./web/Dockerfile"
public = true

[[services]]
name = "worker"           # no public/subdomain/routes → internal only
dockerfile = "./worker/Dockerfile"
```

## Migrations & destructive DDL

Same rule as everywhere: migrations must be **file-based and idempotent**. Run
them from the container `CMD`/entrypoint **or** declare `migrate` — not both (they
would run twice). Hestia runs one pod per app, so entrypoint migrations don't
race. **Startup destructive auto-DDL is rejected** (TypeORM `synchronize: true`,
Hibernate `hbm2ddl.auto=create`, unconditional `create_all`/drop). Normal forward
migrations are fine.

## Checklist

- [ ] App binds `0.0.0.0:$PORT` (works for both local preview and Hestia).
- [ ] Lockfile committed; deterministic install in the build.
- [ ] Start command detectable (Node `start` script / `Procfile web:` for Ruby·Python·Elixir).
- [ ] Dockerfile (if present): pinned base tag, non-root `USER`, `.dockerignore`, no secrets baked in.
- [ ] `deploy.toml` has **no `port` key**; multi-service has **exactly one `public`**.
- [ ] DB apps use `DATABASE_URL`; no self-defined DB; no assumption that `REDIS_URL`/`SECRET_KEY_BASE` exist unless passed via the `env` bundle.
- [ ] Migrations idempotent; no startup destructive DDL.
- [ ] `healthcheck` path returns 200.
