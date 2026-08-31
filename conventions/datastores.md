# Datastores (database & cache)

This is a **minimal run/deploy contract**, not a constraint on your data layer. Pick any ORM,
query builder, schema design, or migration tool you like — the only floor is: connect via the
injected environment variables, and make migrations + seeds run cleanly on an empty database.

## What "just works"

The platform provisions an **isolated database and/or cache instance per preview** and injects the
connection details as environment variables. Your app must **read them from the environment** — do
not hardcode hosts, ports, or credentials.

- **Database** (PostgreSQL): read `DATABASE_URL`.
- **Cache** (Redis): read `REDIS_URL`.

These are only injected when the platform detects you actually use them (a Postgres-backed
dependency for `DATABASE_URL`, a Redis client dependency for `REDIS_URL`). If you don't depend on
them, they won't be set — that's expected.

> PostgreSQL is the provisioned SQL engine. If you want a different database, you own provisioning
> it (e.g. as part of your container), but the per-preview managed instance is Postgres.

## Migrations: file-based and idempotent

Use your **framework's file-based migration tool** so the platform can detect and run it
automatically on a fresh database. Migrations must be **idempotent** — safe to run against an
already-migrated database without error.

Auto-detected migration commands include:

| You use | Auto-run migration |
|---|---|
| Ecto (`ecto_sql` / `postgrex`) | `mix ecto.migrate` |
| Prisma | `npx prisma migrate deploy` |
| `pg` / Sequelize / Knex (raw clients) | detected as needing a DB, **no command inferred** |

If your migration command isn't auto-detected (raw clients, or anything non-standard), **declare it
explicitly** in `preview.toml` under `[db] migrate` / `seed` (see `preview-toml.md`). You do not
need a monolithic bootstrap script — standard locations and commands are enough.

## Green-field bootstrap

A preview always starts from an **empty database**. The platform runs, in order:

1. provision the isolated DB instance,
2. run your migrations (build the schema),
3. run your seed (insert initial data).

So your project must come up correctly with **nothing pre-existing**:

- Put migrations in your framework's standard location (e.g. `priv/repo/migrations/` for Ecto).
- Provide a seed that the platform can detect, or declare it in `preview.toml`. For Ecto, a
  `priv/repo/seeds.exs` is picked up and run automatically (`mix run priv/repo/seeds.exs`).
- Make the seed **idempotent** — re-running it must not crash or create duplicates.

A seed should create enough data for the app to be usable on first load (e.g. a demo account),
not just an empty shell.

## Common failure modes

1. **Hardcoded DB host** (`localhost:5432`, baked-in credentials) → connection fails in the
   preview. Read `DATABASE_URL` / `REDIS_URL` instead.
2. **Non-idempotent migrations** → re-running breaks. Keep them safe to replay.
3. **No seed on green-field** → app boots into an empty/broken state with no demo data.
4. **Undocumented seed credentials** → no one knows how to log in. See below.

## Checklist

- [ ] Connect to the DB via `DATABASE_URL`; connect to the cache via `REDIS_URL`.
- [ ] Migrations are file-based and idempotent (auto-detected, or declared in `preview.toml`).
- [ ] App works green-field: empty DB → migrate → seed → usable.
- [ ] Seed is idempotent.
- [ ] **Record any dummy accounts / credentials the seed creates in the project `README.md`.**
