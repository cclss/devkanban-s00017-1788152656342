# React Router v8 Framework Mode

This guide supports **React Router v8 Framework Mode only**. It is one framework
with two supported run shapes:

1. **SSR/BFF** — a long-running Node process serves server-rendered pages,
   loaders, actions, and client assets.
2. **SPA/static** — `ssr: false` produces `build/client`, served as static files
   with a history fallback.

## Naming and lineage

The canonical and supported name in this guide is **React Router v8 Framework
Mode**. It is the stable React meta-framework successor to Remix v1/v2: the
framework features from that lineage were merged back into React Router as
Framework Mode. It is not the separate Remix 3 project.

Bare phrases such as **"Remix"**, **"Remix framework"**, or **"Remix app"** are
now ambiguous. Never use them as stack identifiers or detection signals; inspect
the package markers instead:

| Name used by a person | Meaning in this guide |
|---|---|
| React Router Framework Mode | The canonical, supported React Router v8 stack |
| Remix framework / Remix app | Ambiguous human wording; inspect package markers before classifying |
| Remix v1/v2 / direct legacy framework packages such as `@remix-run/react` | Legacy predecessor; EOL and not supported here |
| Remix 3 | A separate project, not an alias or upgrade target for this stack |

React Router v7, Remix v2, Remix 3, RSC Framework Mode, non-Node adapters, and
multiple server bundles are outside this contract. Upgrade a Remix v2 app to
React Router v8 before using this guide.

## Current support level

This guide adds a **declared run/deploy contract**, not a native framework
detector:

| Surface | Supported path | Native React Router v8 auto-detection |
|---|---|---|
| Local Preview (Hermes) | Commit the mode-specific `preview.toml` below | No — generic detection currently treats the app as ordinary Vite and expects `dist/` |
| Hestia | Commit `deploy.toml` + the mode-specific `Dockerfile` + `.dockerignore` | No — use the explicit bundle for the deterministic path |

Without the manifest, the Vite dependency wins before tooling can distinguish
SSR from SPA/static. That loses React Router's real `build/server` and
`build/client` outputs. Native support would require corresponding detector
and contract tests in Hermes and Hestia; changing those repositories is outside
this ship-ready guide.

## Version and project contract

Keep all React Router packages on the same v8 release and commit the lockfile.

| Component | Required |
|---|---|
| Node | `>=22.22.0` |
| React / React DOM | `>=19.2.7` |
| React Router packages | `8.x`, aligned to the same release |
| Vite | Match the installed `@react-router/dev` v8 peer range (`^7` or `^8` currently) |
| Module format | ESM (`"type": "module"`) |

Framework Mode markers:

- `@react-router/dev` is installed.
- `vite.config.*` uses the React Router Vite plugin.
- `react-router.config.ts` or `.js` declares the runtime shape.
- `package.json` has conventional `build` and, for SSR, `start` scripts.

A plain `react-router` dependency is **not** enough: Data and Declarative Mode
also use it, but they are not this stack.

Use an explicit IPv4 loopback address for the Vite preview server that React
Router starts internally while building SPA/prerender output:

```ts
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  preview: {
    host: "127.0.0.1",
  },
});
```

The reason for this `preview.host` setting is the temporary **build-time** Vite
server; it also applies if you invoke Vite preview yourself. It does not change
the deployed app contract: the SSR or static production server still binds
`0.0.0.0:$PORT`. Keeping it explicit avoids container builds where `localhost`
resolves differently for the listener and the prerender request.

## Standard scripts

For SSR/BFF, keep these conventional scripts:

```json
{
  "type": "module",
  "engines": {
    "node": ">=22.22.0"
  },
  "scripts": {
    "dev": "react-router dev",
    "build": "react-router build",
    "start": "react-router-serve ./build/server/index.js",
    "typecheck": "react-router typegen && tsc"
  }
}
```

`@react-router/serve`, `@react-router/node`, `react-router`, `react`, and
`react-dom` are runtime dependencies. So is every package imported by the
server entry; the official scaffold includes `isbot`. `@react-router/dev`,
Vite, and TypeScript may be development dependencies. Do not prune a package
that the server build imports at runtime.

For SPA/static, keep `dev`, `build`, and `typecheck`; there is no application
server process in production.

## Pick the run shape explicitly

SSR is the framework default, but declare it so tooling and reviewers do not
have to infer intent:

```ts
import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
} satisfies Config;
```

For a client-only SPA:

```ts
import type { Config } from "@react-router/dev/config";

export default {
  ssr: false,
} satisfies Config;
```

For a static app, add `prerender`. `true` covers every static path declared in
`routes.ts`; enumerate any dynamic paths explicitly and ensure the set is
complete:

```ts
import type { Config } from "@react-router/dev/config";

export default {
  ssr: false,
  prerender: true,
} satisfies Config;
```

With `ssr: false`, React Router still renders during the build. Keep that render
free of browser-only globals. Server `action` and `headers` exports are
unavailable; use `clientLoader`/`clientAction` for runtime browser data. Keep
`@react-router/node` installed because the app is still rendered during the
build.

If `prerender` includes `/`, React Router emits `__spa-fallback.html` for
non-prerendered routes instead of using `index.html`. That hybrid shape needs
host-specific rewrite configuration and is not part of the automatic static
profile here. A pure SPA, or a fully pre-rendered set of routes, stays within
the supported static contract.

## Preview: `preview.toml` is required

Current generic detection sees the Vite dependency and assumes a normal
`dist/` build. React Router Framework Mode uses `build/`, so commit one of these
manifests instead of relying on auto-detection.

### SSR/BFF

```toml
model = "server"

[build]
command = "npm run build"

[serve]
command  = "npm run start"
port_env = "PORT"
```

`react-router-serve` reads `PORT` and `HOST`. Local preview supplies the
loopback host; Hestia does not supply `HOST`, so the server listens on all
interfaces by default. If you set `HOST` yourself for Hestia, it must be
`0.0.0.0`.

### SPA/static

```toml
model = "build-static"

[build]
command = "npm run build"

[serve]
static_dir = "build/client"
```

Verify a direct request to a nested client route, not only `/`. The static host
must fall back to `index.html` for an SPA.

Use the matching package-manager command (`pnpm run build` or `yarn build`) when
the committed lockfile is not npm's.

## Databases and migrations

React Router does not define a standard migration command. If SSR loaders or
actions use a database, declare your real, idempotent command in
`preview.toml`:

```toml
[db]
migrate = "npm run db:migrate"
```

For the explicit Hestia path, also set `database = true` and the corresponding
top-level `migrate` command in `deploy.toml`. The SSR Dockerfile below is a
no-database reference: a database image must also copy its migration files,
schema, and configuration into the final stage. Its migration runner and CLI
must be available after `npm ci --omit=dev`; keep required tooling in runtime
dependencies or ship a compiled, project-owned migration runner. Verify the
declared migration command inside the final image, not only on the host.

Do not expect a runtime `DATABASE_URL` during `react-router build`. Keep
green-field bootstrap data idempotent and production-safe. A Hestia `migrate`
command may call a project-owned `db:deploy` script that runs migrations and
required bootstrap data once. Keep dummy users and shared demo credentials in
a separate local-preview seed; never install those automatically in production.

## Hestia: use a complete explicit bundle

For a deterministic Hestia path, commit these three artifacts together:

1. `deploy.toml`
2. the mode-specific `Dockerfile` below
3. `.dockerignore`

Do not add `deploy.toml` alone: its presence disables Hestia's generated
Dockerfile.

The single-service manifest is the same for both modes when no database is
used:

```toml
healthcheck = "/healthz"
```

Make `/healthz` cheap and independent of external services. In SSR, use a
resource route that returns `200`; in SPA/static, commit a
`public/healthz` file so it is copied into `build/client`.

### SSR/BFF Dockerfile

This no-database npm reference assumes `package-lock.json`. Adapt the
copy/install commands for pnpm or Yarn without dropping the lockfile. Database
apps must also apply the migration-artifact rules above.

```dockerfile
FROM node:24.15.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24.15.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/build ./build
USER node
CMD ["./node_modules/.bin/react-router-serve", "./build/server/index.js"]
```

The container executes `react-router-serve` directly as PID 1 so its graceful
`SIGTERM` handling remains effective. The process reads Hestia's injected
`PORT`; do not add `EXPOSE 3000` or hardcode a port.

### SPA/static Dockerfile

This image rebuilds `build/client` and serves it with SPA history fallback.
Install exact `serve@14.2.6` as a runtime dependency and commit the resulting
lockfile so the static server and its transitive dependencies are reproducible.

```dockerfile
FROM node:24.15.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24.15.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NO_UPDATE_NOTIFIER=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/build/client ./build/client
USER node
CMD ["sh", "-c", "exec ./node_modules/.bin/serve --no-clipboard -s build/client -l tcp://0.0.0.0:${PORT}"]
```

Use this `.dockerignore` for either image:

```dockerignore
.git
.github
node_modules
build
.react-router
*.log
.env
.env.*
!.env.example
```

`build` is intentionally ignored because the image rebuilds it from committed
source. Never copy a local `.env` into the build context.

## Environment and proxy rules

- Keep secrets in server-only modules and read them only from SSR
  loaders/actions or other server code.
- SPA/static has no runtime server for secret handling. Client configuration is
  public, and deploy-time Hestia env does not retroactively rewrite an already
  built browser bundle.
- Build absolute URLs from the incoming request and forwarded headers. Do not
  hardcode the preview or Hestia domain.
- React Router validates action origins against the host in its constructed
  request URL. Hestia's ingress preserves the public host, but
  `@react-router/serve` does not enable Express `trust proxy`; exercise at least
  one mutation/action through the real Hestia URL. If another proxy topology
  produces a host mismatch, keep `allowedActionOrigins` exact or use a custom
  `@react-router/express` server with narrowly scoped `trust proxy`. Never solve
  an origin mismatch with a wildcard.
- Write application logs to stdout/stderr and do not depend on writable files
  outside `/tmp`.

## Verification checklist

- [ ] All React Router packages are v8 and aligned; Node is `>=22.22.0`.
- [ ] `npm run typecheck` and `npm run build` pass from a clean install.
- [ ] Vite's build-time `preview.host` is explicitly `127.0.0.1`.
- [ ] The selected `ssr` mode matches `preview.toml`.
- [ ] SSR listens through `PORT`; Hestia binds `0.0.0.0`.
- [ ] SPA/static serves `build/client` and a direct nested-route request works.
- [ ] SPA/static locks the chosen static server as a runtime dependency.
- [ ] DB apps include migration artifacts and can run the declared migration
      from the final image.
- [ ] SSR handles `SIGTERM` cleanly without dropping in-flight requests.
- [ ] `/healthz` returns `200` without requiring a database or third party.
- [ ] No secret is imported into the client module graph or baked into static JS.
- [ ] Hestia explicit mode includes `deploy.toml`, `Dockerfile`, and
      `.dockerignore` together.
