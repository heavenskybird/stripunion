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

The first sync writes only the first five. The remaining tables establish the next migration boundary for measurement, experiments, visual QA history and failed jobs.

Row Level Security is enabled with no anonymous policies. GitHub Actions uses a service-role credential server-side only.

## One-time setup

1. Create a Supabase Free project (or compatible PostgreSQL instance with a PostgREST endpoint).
2. Apply `ops/control-plane/schema.sql` in the SQL editor.
3. Add repository variable `SUPABASE_URL`.
4. Add repository secret `SUPABASE_SERVICE_ROLE_KEY`.
5. Run `npm run sync:growth-control-plane` through the hourly producer or a manual Actions run.

Never put the service-role key in source, chat, browser JavaScript or public logs.

## Runtime behavior

Without both settings:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

the sync prints a structured skip and exits successfully.

Set `CONTROL_PLANE_REQUIRED=true` only after the shadow database has remained healthy and reconciled. Until then, a database problem must not stop content production.

## Migration gates

Do not promote PostgreSQL to operational authority until all are true:

1. at least 24 consecutive hourly syncs succeed;
2. job counts reconcile with the repository backlog;
3. publication counts and slugs reconcile with the publication ledger;
4. opportunity and offer mirrors show no destructive overwrite or missing rows;
5. credentials remain server-side and RLS remains enabled.

After those gates pass, migrate in this order:

1. job claim / lease state;
2. retries and dead letters;
3. visual-QA history;
4. experiment state;
5. opportunity lifecycle;
6. publication state.

Git should continue to store code, content artifacts and durable reports, not real-time locks or leases.
