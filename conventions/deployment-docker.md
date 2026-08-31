# Deployment: Docker

A minimal **deploy** contract for shipping your project as a single container image. This is a floor, not a ceiling — it does not constrain your code design, stack, architecture, patterns, or testing. It only describes what an image must respect to run behind a reverse proxy (TLS terminator) as a single-container target.

## How this relates to local preview (read this first)

Local preview runs your app **from source** — it detects the framework by inspecting source markers (`package.json`, `mix.exs`, a root `index.html`, or a prebuilt output dir). It does **not** build your Dockerfile to preview.

So keep both paths intact:

- **Source markers** drive the local preview path. Keep `package.json` / `mix.exs` / `index.html` in place.
- **The Dockerfile** is the deploy path. Add it for shipping; it does not change preview.

⚠️ **If the repo has only a `Dockerfile` (or `docker-compose.yml`) and no source markers, local preview is blocked** — it gets classified as container-only and cannot be previewed from source. The fix is to keep your real source files in the repo alongside the Dockerfile, not to remove the Dockerfile.

## Image contract

- **Single port, monolithic.** One container exposes one port. If you have a static frontend, serve it from the same backend on that one port. (Single port is the recommended shape, not a forced architecture.)
- **Respect `PORT`.** Bind to the `PORT` environment variable at runtime; never
  hardcode a port. Local preview supplies a loopback `HOST`; Hestia injects
  `PORT` but not `HOST`, so a deployed container must bind `0.0.0.0:$PORT`.
- **Plain HTTP.** Listen in plaintext HTTP. TLS is terminated upstream by the proxy/orchestrator. Do **not** force `https://` or self-redirect to HTTPS.
- **Config via env.** Read all config and secrets from environment variables. Never bake secrets into the image or commit them.
- **Multi-stage build.** Build in one stage, copy artifacts into a slim runtime stage — smaller, faster, fewer attack surfaces.
- **Non-root.** Run the process as a non-root user.
- **Small base image.** Use a slim/alpine or distroless runtime base where practical.

## Skeletons per stack

These are minimal starting points. Adapt freely.

### Static site
Serve the built files with any small static server. Make it honor `PORT` and add SPA fallback if you have client-side routing.
```dockerfile
FROM nginx:alpine
COPY ./dist /usr/share/nginx/html
# Template nginx.conf to listen on $PORT and fall back to /index.html for SPA routes.
```

### Node backend (build → slim runtime)
```dockerfile
FROM node:lts-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build   # if you have a build step

FROM node:lts-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
USER node
# Bind to process.env.PORT inside your start command.
CMD ["npm", "start"]
```

### React Router v8 Framework Mode (stable successor to Remix v1/v2)

React Router v8 has two different image shapes: an SSR/BFF Node process and a
static `build/client` image. Do not treat both as a generic Vite `dist/` build.
Use the pinned, non-root reference images and matching `.dockerignore` in
`stack-react-router-v8.md`.

### Phoenix / Elixir (build → release)
```dockerfile
FROM hexpm/elixir:1.16-otp-26-alpine AS build
WORKDIR /app
ENV MIX_ENV=prod
RUN mix local.hex --force && mix local.rebar --force
COPY mix.exs mix.lock ./
RUN mix deps.get --only prod && mix deps.compile
COPY . .
RUN mix assets.deploy && mix release

FROM alpine:3.19
RUN adduser -D app
WORKDIR /app
COPY --from=build /app/_build/prod/rel/my_app ./
USER app
# The release reads PORT, PHX_HOST, SECRET_KEY_BASE, DATABASE_URL from the env.
CMD ["bin/my_app", "start"]
```

## Checklist

- [ ] Multi-stage build (build stage → slim runtime stage).
- [ ] Binds to `PORT`; no hardcoded port.
- [ ] Plain HTTP only; no forced HTTPS / self-redirect.
- [ ] Single port; static frontend served by the same process.
- [ ] Runs as non-root, slim base image.
- [ ] Secrets read from env; nothing secret baked into the image.
- [ ] **Source markers (`package.json` / `mix.exs` / `index.html`) kept in the repo** so local preview still works.
