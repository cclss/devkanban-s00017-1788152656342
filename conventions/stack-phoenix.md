# Elixir / Phoenix / LiveView

A minimal run/deploy contract so the platform can build, boot, and serve your
Phoenix app behind a reverse proxy (TLS terminator) as a single-container
target. This is a **floor, not a ceiling**: it does not constrain your code
design, contexts, supervision tree, LiveView usage, or test strategy. Build
whatever you want on top of these few rules.

The preview runtime detects a Phoenix app from `mix.exs` declaring the
`:phoenix` dependency. Detection works off **dependency keys** in `mix.exs`,
not your module layout, so you are free to structure code however you like.

## What works well

- **`mix.exs` with `:phoenix`.** Run as a server in production mode. The
  platform injects `MIX_ENV=prod` and `PHX_SERVER=true` and starts the
  endpoint, so wire up your prod config to actually serve.
- **Bind the injected `PORT`.** In `config/runtime.exs` read the port from the
  environment (the platform provides it) and bind the HTTP listener to it.
  Listen plain HTTP — TLS is handled upfront by the proxy. Do not force
  `https://` or hardcode an absolute URL; the external host arrives as
  `PHX_HOST`.
- **Assets via the standard build.** Asset compilation runs automatically as
  part of preparation (the usual dependency fetch, asset setup, compile, and
  asset deploy steps). Keep your assets behind the standard `assets.deploy`
  flow so styles/JS are present in prod.
- **Ecto / Postgres.** Declaring `:ecto_sql` or `:postgrex` in `mix.exs` marks
  the app as needing a database. The platform provisions an isolated Postgres
  instance and injects `DATABASE_URL`; read it in `config/runtime.exs`. It then
  runs your **file-based** migrations (`priv/repo/migrations/`) idempotently
  via the framework's standard migrate task on a green-field (empty) database.
- **Seeds.** If `priv/repo/seeds.exs` exists, it is run after migrations to
  populate initial data on green-field. Make it **idempotent** (safe to re-run).
- **Cache.** Declaring a Redis client (`:redix` or `:redis`) marks the app as
  needing a cache; the platform provisions one and injects `REDIS_URL`. Read it
  from the environment.
- **Declare external env in `config/runtime.exs`.** Use
  `System.fetch_env!("KEY")` for **required** keys and `System.get_env("KEY")`
  for **optional** ones. The runtime scans `config/runtime.exs` for these
  calls: `fetch_env!` keys are treated as required, `get_env` keys as optional.
  Declaring a required key lets the platform prompt you to supply it before
  boot instead of crashing blindly.

## Auto-injected env (you do not set these)

These are provided and managed by the platform; your app may rely on them but
cannot override them: `PORT`, `HOST` (`127.0.0.1`), `HOSTNAME` (`127.0.0.1`),
`PHX_HOST` (external domain), `PHX_SERVER` (`true`), `MIX_ENV` (`prod`),
`NODE_ENV` (`production`), `SECRET_KEY_BASE`, `DATABASE_URL` (when DB is used),
`REDIS_URL` (when cache is used). Keys you add yourself (e.g. external API
keys) you must supply.

## Common failures

- **No prod / `PORT` config** — the app boots in dev or on a hardcoded port and
  the health check never passes. Configure prod to serve on the injected port.
- **Assets not built** — styles/JS 404 because the standard asset deploy was
  skipped or misconfigured. Keep the standard asset pipeline intact.
- **Required env not declared** — reading an external key outside
  `config/runtime.exs` (or not via `fetch_env!`) crashes the app just before
  boot with no chance to prompt. Declare required keys with `fetch_env!` in
  `config/runtime.exs`.
- **Manual migrations** — running migrations by hand from code or an
  interactive shell. Keep them as file-based migrations in the standard
  location so the platform runs them automatically and idempotently.
- **Forced HTTPS / absolute URLs** — forcing `https://` or self-redirects
  behind the TLS-terminating proxy causes redirect loops. Listen plain HTTP and
  trust the external host from `PHX_HOST` / forwarded headers.

## Checklist

- [ ] Prod config serves on the injected `PORT` over plain HTTP.
- [ ] `config/runtime.exs` declares external env: `fetch_env!` (required),
      `get_env` (optional).
- [ ] If using Ecto: `DATABASE_URL` read from env, file-based migrations in
      `priv/repo/migrations/`, idempotent `priv/repo/seeds.exs` for green-field.
- [ ] Assets go through the standard `assets.deploy` build.
- [ ] Record green-field local run steps (migrate + seed) and any seeded dummy
      credentials in the project `README.md`.

Non-standard build/run or a monorepo target? Declare it in `preview.toml`
(see `preview-toml.md`).
