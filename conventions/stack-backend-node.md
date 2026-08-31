# Node backend

Minimal run/deploy contract for Node.js backends (Express, Fastify, Koa, NestJS, or
plain Node). This is a **floor, not a ceiling**: it does not constrain your code
design, architecture, patterns, or testing strategy. Build whatever you want on top —
these notes only ensure the preview runtime can detect, run, and deploy your app.

## What works well

- **Framework backends are auto-detected by dependency.** If your `package.json`
  declares any of `express`, `fastify`, `koa`, or `@nestjs/core`, the platform
  recognizes it as a long-running server and runs it. No extra config needed.
- **Plain Node (no framework)** is detected through a `"start"` script in
  `package.json`. The script is your entry point — the platform runs it to start the
  server (e.g. `"start": "node server.js"`).
- **Bind to the injected port.** The platform sets `PORT` in the environment; read it
  with `process.env.PORT`. `127.0.0.1` or `0.0.0.0` are both fine for local preview,
  but **bind `0.0.0.0` for a deployed container (e.g. Hestia)** — a loopback-only bind
  is unreachable there and fails the health check. `app.listen(process.env.PORT, '0.0.0.0')`
  works for both. Never hardcode a number.
- **Monolithic, single port (recommended).** If you also have a static frontend, have
  the same server serve those static assets so everything is reachable on one port.
  Single-port is the recommended shape, not a forced architecture.
- **Datastores come from environment URLs.** A SQL database is reached via
  `DATABASE_URL` and a cache via `REDIS_URL`; the platform provisions isolated
  instances and injects these. Common SQL clients (`pg`, `sequelize`, `knex`,
  `prisma`/`@prisma/client`) and cache clients (`redis`, `ioredis`) are recognized,
  and the matching URL is injected when present.

## Auto-injected environment

The platform injects these and your app may rely on them; do not hardcode or override
them. (See `golden-rules.md` for the full table.)

- `PORT` — the port to listen on (or your declared port variable).
- `HOST=127.0.0.1`, `HOSTNAME=127.0.0.1` — loopback bind address.
- `NODE_ENV=production`.
- `SECRET_KEY_BASE`.
- `DATABASE_URL` — present when your app uses a SQL database.
- `REDIS_URL` — present when your app uses a cache.

## Common failures

1. **Hardcoded port** (`app.listen(3000)`). The health check probes the injected
   `PORT`, so a fixed port means it never comes up. Always
   `app.listen(process.env.PORT)`.
2. **Plain Node without a `start` script.** With no framework dependency and no
   `"start"` script, there is nothing to detect — auto-detection fails. Add a `start`
   script that launches your server.
3. **Frontend and backend split across two ports.** Combine them into one
   single-port monolith (backend serves the built static assets), or declare a custom
   layout in `preview.toml`.
4. **Hardcoded datastore host** (`localhost:5432`, `localhost:6379`). Read
   `DATABASE_URL` / `REDIS_URL` from the environment instead.

## Checklist

- [ ] Server listens on `process.env.PORT` (no hardcoded port).
- [ ] Framework dependency present, or a `"start"` script for plain Node.
- [ ] Any static frontend is served by the same server (single port).
- [ ] Database/cache reached via `DATABASE_URL` / `REDIS_URL`.

If detection is ambiguous (monorepo, custom build, non-standard start command),
declare it explicitly in `preview.toml` — see `preview-toml.md`.
