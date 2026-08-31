# Networking: port, host, and TLS

This is a **minimal run contract**, not a constraint on your code design,
architecture, or routing patterns. As long as you honor these few rules, your
app runs locally and deploys behind the proxy. Anything above this is your call
(floor, not ceiling).

## How the runtime exposes your app

Your app runs as a single-container target behind a reverse proxy that
terminates TLS. The proxy speaks plaintext HTTP to your app over a loopback
address. The public domain is assigned by the platform, not by you.

The platform injects these (you cannot override them):

| Variable          | Value             | Meaning                                  |
|-------------------|-------------------|------------------------------------------|
| `PORT`            | assigned          | The port your app must listen on         |
| `HOST`            | `127.0.0.1`       | Loopback bind hint                        |
| `HOSTNAME`        | `127.0.0.1`       | Loopback bind hint (some runtimes use it) |
| `PHX_HOST`        | external domain   | The public hostname (for URL generation) |

If you declare a custom port variable name (see `preview-toml.md`), the platform
injects that name instead of `PORT`.

## What works

- **Bind to `PORT`.** Read the port from the environment and listen on it. Never
  hardcode a port number.
- **Listen on plaintext HTTP.** TLS is handled by the front terminator. Your app
  should accept plain HTTP requests.
- **`127.0.0.1` or `0.0.0.0` are both fine for local preview** (it reaches you on
  loopback). **But when the container is deployed (e.g. to Hestia) the platform
  reaches you on the container's own IP, not loopback — bind `0.0.0.0` there or the
  health check fails.** Preferring `0.0.0.0` everywhere gives one bind that works for
  both. Respecting `PORT` is what matters either way; never hardcode a port.
- **Build URLs from the request / forwarded headers.** The public hostname is
  provided at runtime (e.g. via `PHX_HOST`). Generate absolute URLs from that or
  from incoming request data — do not hardcode a domain.
- **Trust the proxy's forwarded headers.** Use `X-Forwarded-Proto`,
  `X-Forwarded-Host`, etc. to learn that the original request was HTTPS on the
  public domain. The health check hits your app on loopback over HTTP.

## Common failures

1. **Forcing `https://` or redirecting HTTP→HTTPS yourself.** The terminator
   already does TLS, so your app sees plaintext. A self-issued HTTPS redirect
   causes a redirect loop and the preview never becomes healthy. Listen on plain
   HTTP and let the proxy own TLS.
2. **Hardcoding an absolute URL or domain.** The external domain is assigned per
   preview and will not match your hardcoded value. Links, redirects, and
   callbacks break. Build URLs from the runtime host / forwarded headers.
3. **Ignoring proxy headers.** If you read the scheme/host straight off the
   loopback connection, you conclude "HTTP on 127.0.0.1" and emit wrong links.
   Honor `X-Forwarded-*`.
4. **Hardcoding a port.** If you ignore `PORT`, the proxy cannot reach your app
   and the health check fails.

## Checklist

- [ ] Listen on the injected `PORT` (or your declared port variable) — no
      hardcoded port.
- [ ] Serve plaintext HTTP; do not terminate TLS or force HTTPS redirects.
- [ ] No hardcoded absolute URLs or domains; derive them at runtime.
- [ ] Trust forwarded proxy headers (`X-Forwarded-Proto`/`-Host`) for scheme and
      hostname.
