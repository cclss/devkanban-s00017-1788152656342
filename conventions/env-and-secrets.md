# Environment variables & secrets

This is a minimal **run/deploy contract**, not a constraint on your code. How you
structure config loading, validation, or layering is your call — these rules only
ensure the preview runtime can start your app and that you never leak a secret.

## Two kinds of variables

**1. Auto-provided (you do NOT set these, and you cannot override them).**
The platform injects a fixed set of variables on every run. If your `.env`, your
shell, or your code tries to set one of these, the platform-provided value wins —
your value is dropped. Treat them as read-only inputs you may *consume*:

```
PORT (bind here)   HOST=127.0.0.1   HOSTNAME=127.0.0.1
PHX_HOST           PHX_SERVER=true  MIX_ENV=prod   NODE_ENV=production
SECRET_KEY_BASE    DATABASE_URL (when a DB is used)   REDIS_URL (when a cache is used)
```

Do not declare these in `.env.example` and do not generate your own
`SECRET_KEY_BASE` — the platform manages them. See `golden-rules.md` for the full
table and the reasoning behind each.

**2. App-specific (you DO set these).**
Anything your app needs that the platform can't know about — third-party API keys,
feature flags, external service URLs, OAuth client IDs/secrets, etc. These are the
only variables you are responsible for declaring.

## Declaring required vs optional variables

The platform reads two signals to learn which app-specific variables your code needs:

- **A committed example file** — one of `.env.example`, `.env.sample`, or
  `.env.template` at the project root. Each `KEY=value` line is classified:
  - **Empty value or a placeholder → REQUIRED.** A value counts as a placeholder if
    it is empty, starts with `<`, or contains any of: `your`, `xxx`, `changeme`,
    `change-me`, `replace`, `todo`, `placeholder`, `example` (case-insensitive).
  - **A real, usable default value → OPTIONAL.** The app can boot with it as-is.
  - Blank lines, comments (`#`), and lines without `=` are ignored. Keys must be
    `UPPER_SNAKE_CASE` (e.g. `API_KEY`); other lines are skipped.
- **Source references** — the platform also scans your source for reads like
  `process.env.API_KEY`, `System.get_env("API_KEY")`, and
  `System.fetch_env!("API_KEY")` to catch variables you forgot to list. Any
  auto-provided key (the list above) is always excluded from this.

If a required variable is missing at startup, the platform pauses and **asks you to
fill it in** rather than failing silently — so declaring required variables is how
you get prompted instead of crashing on first boot.

Example `.env.example`:

```dotenv
# REQUIRED — empty/placeholder values are treated as must-provide
API_KEY=
STRIPE_SECRET=<your-stripe-key>
SMTP_PASSWORD=changeme

# OPTIONAL — a real default means the app boots without input
LOG_LEVEL=info
PAGE_SIZE=20
```

## Secrets must never enter git

- Real secret values live only in the environment at runtime — never hardcoded in
  source, never committed.
- Add `.env` (and `.env.local`, `.env.*.local`) to `.gitignore`.
- Commit **only** the example file (`.env.example`), with values left empty or set
  to obvious placeholders. It documents *which* variables exist, not their values.

If you don't use an example file, that's fine — but then your code must clearly and
loudly fail when a required variable is absent, so the missing-key prompt can fire.

## Checklist

- [ ] App-specific variables declared in a root `.env.example` (committed).
- [ ] Required keys left empty / placeholder; optional keys given real defaults.
- [ ] `.env` and other local env files are git-ignored.
- [ ] No secret value hardcoded in source or committed to history.
- [ ] You consume auto-provided keys (`PORT`, `DATABASE_URL`, …) instead of
      redefining them.
