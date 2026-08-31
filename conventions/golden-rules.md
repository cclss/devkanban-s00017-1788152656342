# Golden rules

These are the **minimal run/deploy contracts** that let any project you build start
locally and ship as a single container behind a reverse proxy (TLS terminator).
They are a **floor, not a ceiling**: they say nothing about how to design your code,
which stack to pick, or how to test. Build whatever you want on top.

## The contracts — why & how

**1. Bind to `PORT`, never a hard-coded port.**
The runtime assigns a port and exposes it through the front proxy. Read it from the
environment (`process.env.PORT`, `System.get_env("PORT")`, etc.). A hard-coded
`listen(3000)` fails health checks.

**2. One port, exposed to the outside.**
Serve everything (API + any static frontend) from a single process/port — monolithic
first. This is the recommended shape so auto-detection and the proxy can reach you on
one address; it is not a forced architecture.

**3. Read config from the environment (12-factor).**
All configuration and secrets arrive as environment variables — never bake them into
code or images. The same artifact runs in dev and prod by swapping env only
(dev/prod parity).

**4. Datastores come from env.**
The platform provisions an isolated database and cache and injects `DATABASE_URL`
(PostgreSQL) and `REDIS_URL`. Read those — never hard-code `localhost:5432`.

**5. Log to stdout/stderr.**
Treat logs as an event stream written to standard output. Do not manage log files
yourself; the runtime captures the stream.

**6. Stay stateless.**
Do not assume the local disk persists between runs or that two requests hit the same
process. Keep durable state in the database or cache. The local filesystem is scratch.

**7. Listen in plain HTTP.**
TLS is terminated upstream by the proxy. Your app listens on plain HTTP and must not
force `https://` or self-redirect to HTTPS (that causes redirect loops). Trust the
forwarded proto/host headers instead of hard-coding absolute URLs.

## Auto-provided environment

The runtime **injects** these and your app may rely on them. They are **managed** —
values you set for the same keys are ignored, so do not try to override them:

| Variable | Value / meaning | When |
|---|---|---|
| `PORT` | Port to bind (or the port variable you declared) | always |
| `HOST` | `127.0.0.1` | always |
| `HOSTNAME` | `127.0.0.1` | always |
| `PHX_HOST` | The external domain assigned to your app | always |
| `PHX_SERVER` | `true` | always |
| `MIX_ENV` | `prod` | always |
| `NODE_ENV` | `production` | always |
| `SECRET_KEY_BASE` | A per-app secret, stable across a run | always |
| `DATABASE_URL` | Connection string for the provisioned DB | only if you use a database |
| `REDIS_URL` | Connection string for the provisioned cache | only if you use Redis |

**Keys you supply** (third-party API keys, feature flags, etc.) are separate. Declare
them so the runtime can prompt for any that are missing — see `env-and-secrets.md`.
You can pass extra env of your own, but any key that collides with a managed key above
is dropped in favor of the injected value.

## Secrets are never committed

- Keep real secrets out of source control. Add `.env` (and similar) to `.gitignore`.
- Commit only an example file (`.env.example`) with empty values or placeholders so
  others know which keys exist, without leaking values.
- Never paste keys, tokens, or passwords into code.

## Document green-field startup in your README

Your project `README.md` must record how to bring the project up **from an empty
state**:

- The local run steps, including running database migrations and seeds.
- Any dummy accounts or credentials your seed data creates (username/password), so a
  reviewer can log in immediately.

Migrations should be **idempotent** (file-based migration tools) and seeds **safe to
re-run**. Details per stack live in `datastores.md`.

## Out of scope

These rules **do not** cover code quality, architecture, design patterns, or testing
strategy. Those choices are entirely yours.
