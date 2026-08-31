# Agent conventions

This project is built into a container image and runs behind a reverse proxy
(TLS terminator), exposed on a single port. Follow the BASELINE run/deploy
contract below, then read the `conventions/` document that matches what you are
building.

These rules do not constrain your code design. Stack, architecture, design
patterns, and testing strategy are yours to choose. The contract below exists
only to guarantee local preview and deployment — build whatever you want on top
of it (floor, not ceiling).

<!-- BEGIN BASELINE (preserve: do not delete or weaken) -->

1. Bind the port from the `PORT` environment variable (never hardcode a port).
2. Expose a single port externally (monolithic first; the backend also serves the
   static frontend). The single port is the recommended shape, not a forced
   architecture.
3. Connect to the database via `DATABASE_URL` and the cache via `REDIS_URL`
   environment variables (the platform injects these).
4. Receive all configuration and secrets via environment variables — never
   hardcode secrets/keys in code or commit (track) them in git.
5. TLS is handled by the front terminator → the app listens over plain HTTP.
   Never assume absolute `https://` URLs or force HTTPS redirects.
6. Follow standard build/run scripts (`build`/`start`) or your framework's
   standard conventions.
7. Make the database run via the framework's file-based migrations, executed
   idempotently, so that on a green-field (empty) state the migrations and an
   initial seed run from the standard location/command (the platform detects and
   runs them; declare in `preview.toml [db]` if non-standard). Keep seeds
   idempotent.
8. Record in the project `README.md` the green-field local run procedure
   (migrations and seed included) and any dummy accounts/credentials the seed
   creates.

<!-- END BASELINE -->

Preserve the BASELINE block. If you need extra guidance during development, add
it in a separate section of this file, but do not delete or weaken BASELINE.

## Routing

| What you are building | Read |
|---|---|
| Static site (HTML/CSS/JS) | `conventions/stack-static.md` |
| React frontend (Vite / CRA / Next) | `conventions/stack-frontend-react.md` |
| React Router v8 Framework Mode (stable successor to Remix v1/v2) | `conventions/stack-react-router-v8.md` |
| Node backend (express/fastify/nest/vanilla) | `conventions/stack-backend-node.md` |
| Elixir/Phoenix/LiveView | `conventions/stack-phoenix.md` |
| Using a database or cache | `conventions/datastores.md` |
| Environment variables and secrets | `conventions/env-and-secrets.md` |
| Ports/host/TLS | `conventions/networking.md` |
| Auto-detection is ambiguous | `conventions/preview-toml.md` (escape hatch) |
| Deploying later | `conventions/deployment-docker.md` |
| Publishing to Hestia (`deploy.toml`, or deploying with no manifest) | `conventions/deploy-toml.md` |

Most of the time, following the contract above is enough — auto-detection brings
up a local preview on its own. For monorepos, non-standard builds, or special
commands, read `conventions/preview-toml.md`, add a `preview.toml`, and update it
whenever your build/run shape changes.

For the reasoning and how-to behind each contract, read
`conventions/golden-rules.md` first.

## Shipping

When the app is ready to deploy, choose one complete path:

- **Fallback:** leave `deploy.toml` absent so Hestia can derive the deployment
  from `preview.toml` or auto-detection.
- **Explicit:** commit `deploy.toml`, every referenced `Dockerfile`, and
  `.dockerignore` together. A `deploy.toml` disables Hestia's Dockerfile
  generation, so never add a partial manifest by itself.

See `conventions/deploy-toml.md` for the schema and how to derive the explicit
bundle from your app (and your `preview.toml`, if any). These are deploy
artifacts only — they do not change your code or weaken BASELINE.
