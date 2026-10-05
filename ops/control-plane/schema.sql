-- StripUnion Growth Control Plane v1
-- Apply this once in a dedicated Supabase/PostgreSQL project before enabling required sync.
-- The service-role key is used only from GitHub Actions; anonymous/browser access stays blocked.

create table if not exists public.control_plane_runs (
  id text primary key,
  source text not null,
  status text not null check (status in ('running','succeeded','failed')),
  started_at timestamptz not null,
  completed_at timestamptz,
  snapshot jsonb not null default '{}'::jsonb,
  error text
);

create table if not exists public.growth_opportunities (
  opportunity_id text primary key,
  rank integer,
  target_keyword text,
  recommended_action text,
  traffic_intent text,
  commercial_intent text,
  monetization_route text,
  confidence text,
  risk text,
  source_generated_at timestamptz,
  last_seen_at timestamptz not null,
  payload jsonb not null
);

create table if not exists public.content_jobs (
  job_id text primary key,
  intent text,
  category text,
  surface text,
  priority integer,
  status text not null,
  artifact_path text,
  updated_at timestamptz not null,
  payload jsonb not null
);

create table if not exists public.publications (
  publication_id text primary key,
  slug text not null,
  title text,
  category text,
  category_slug text,
  url text,
  channel text not null,
  status text not null,
  published_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz not null,
  payload jsonb not null
);

create table if not exists public.affiliate_offers (
  offer_id text primary key,
  brand text,
  category text,
  status text not null,
  relationship text,
  updated_at timestamptz not null,
  payload jsonb not null
);

create table if not exists public.growth_observations (
  observation_id text primary key,
  observed_at timestamptz not null,
  source text not null,
  entity_type text not null,
  entity_id text,
  metric text not null,
  value_numeric double precision,
  value_text text,
  dimensions jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.growth_experiments (
  experiment_id text primary key,
  status text not null,
  surface text,
  hypothesis text,
  primary_metric text,
  started_at timestamptz,
  ended_at timestamptz,
  winner text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null
);

create table if not exists public.visual_checks (
  visual_check_id text primary key,
  checked_at timestamptz not null,
  target text not null,
  viewport text not null,
  status text not null,
  failure_count integer not null default 0,
  warning_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.dead_letters (
  dead_letter_id text primary key,
  created_at timestamptz not null,
  job_type text not null,
  job_id text,
  reason text not null,
  retryable boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  resolved_at timestamptz
);

create index if not exists growth_opportunities_rank_idx
  on public.growth_opportunities (rank);
create index if not exists content_jobs_status_priority_idx
  on public.content_jobs (status, priority desc);
create index if not exists publications_published_at_idx
  on public.publications (published_at desc);
create index if not exists affiliate_offers_status_idx
  on public.affiliate_offers (status);
create index if not exists growth_observations_entity_idx
  on public.growth_observations (entity_type, entity_id, observed_at desc);
create index if not exists growth_experiments_status_idx
  on public.growth_experiments (status, updated_at desc);
create index if not exists visual_checks_target_idx
  on public.visual_checks (target, checked_at desc);
create index if not exists dead_letters_open_idx
  on public.dead_letters (resolved_at, created_at desc);

alter table public.control_plane_runs enable row level security;
alter table public.growth_opportunities enable row level security;
alter table public.content_jobs enable row level security;
alter table public.publications enable row level security;
alter table public.affiliate_offers enable row level security;
alter table public.growth_observations enable row level security;
alter table public.growth_experiments enable row level security;
alter table public.visual_checks enable row level security;
alter table public.dead_letters enable row level security;

comment on table public.control_plane_runs is
  'Audit trail for repository-to-database control-plane synchronization.';
comment on table public.growth_opportunities is
  'Latest evidence-backed opportunities mirrored from ops/growth/opportunities/latest.json.';
comment on table public.content_jobs is
  'Editorial state mirrored from the canonical repository backlog during shadow mode.';
comment on table public.publications is
  'Verified publication ledger mirrored from repository publication records.';
comment on table public.affiliate_offers is
  'Centralized offer registry mirror; sensitive credentials never belong here.';


-- Data API access for the server-side secret key, which maps to the service_role Postgres role.
-- Do not grant these tables to anon or authenticated.
grant usage on schema public to service_role;
grant select, insert, update on table
  public.control_plane_runs,
  public.growth_opportunities,
  public.content_jobs,
  public.publications,
  public.affiliate_offers,
  public.growth_observations,
  public.growth_experiments,
  public.visual_checks,
  public.dead_letters
to service_role;
