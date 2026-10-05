# Growth Control Plane v1

## Purpose

The first Control Plane stage moves operational state away from Git without making a database a publication dependency before it has been proven.

Current repository files remain authoritative during **shadow mode**:

- `ops/editorial/hourly-backlog.json`
- `ops/editorial/publication-ledger/astro/*.json`
- `ops/growth/opportunities/latest.json`
- `ops/growth/offers/direct-offers.json`

`scripts/sync-growth-control-plane.mjs` mirrors that state into PostgreSQL/Supabase. The producer continues to work normally when the database is absent or temporarily unavailable.

## Why shadow mode first

A direct cutover would turn a new database into a single point of failure for an hourly system that is already publishing successfully. Shadow mode provides a reconciliation period where Git and PostgreSQL can be compared before claims, retries and publication state are switched to database authority.

## Tables

The schema in `ops/control-plane/schema.sql` creates:

- `control_plane_runs`
- `growth_opportunities`
- `content_jobs`
- `publications`
- `affiliate_offers`
- `growth_observations`
- `growth_experiments`
- `visual_checks`
- `dead_letters`

The Control Plane now writes all of these operational layers: repository state, normalized observations, experiment state, visual QA history and dead-letter audit records.

Row Level Security is enabled with no anonymous policies. GitHub Actions uses a service-role credential server-side only.

## One-time setup

1. Create a Supabase Free project (or compatible PostgreSQL instance with a PostgREST endpoint).
2. Apply `ops/control-plane/schema.sql` in the SQL editor.
3. Add repository variable `SUPABASE_URL`.
4. Create a Supabase **secret API key** (`sb_secret_...`) and add it as repository secret `SUPABASE_SECRET_KEY`. The legacy `SUPABASE_SECRET_KEY` is supported only as a fallback.
5. Run `npm run sync:growth-control-plane` through the hourly producer or a manual Actions run.

Never put the service-role key in source, chat, browser JavaScript or public logs.

## Runtime behavior

Without both settings:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

the sync prints a structured skip and exits successfully.

`ops/control-plane/mode.json` controls authority. In `shadow` mode, sync/read failures remain non-blocking for publishing. After automatic promotion to `authoritative`, Control Plane reads and writes become required and failures stop the producer rather than allowing stale queue state.

## Migration gates

Do not promote PostgreSQL to operational authority until all are true:

1. at least 24 consecutive hourly syncs succeed;
2. job counts reconcile with the repository backlog;
3. publication counts and slugs reconcile with the publication ledger;
4. opportunity and offer mirrors show no destructive overwrite or missing rows;
5. credentials remain server-side and RLS remains enabled.

The repository now implements these layers before promotion:
1. batch claim/lease checkpoint in `content_jobs`;
2. retry audit through `dead_letters`;
3. visual-QA persistence;
4. experiment state and attribution observations;
5. opportunity and publication mirrors;
6. an hourly readiness evaluator.

`.github/workflows/control-plane-authority-promotion.yml` evaluates the gate automatically. Once 24 distinct producer cycles pass with no failed runs, no >110-minute gap and no repository IDs missing from the database, it changes `mode.json` from `shadow` to `authoritative` and commits that promotion to `main`.

Git should continue to store code, content artifacts and durable reports, not real-time locks or leases.
