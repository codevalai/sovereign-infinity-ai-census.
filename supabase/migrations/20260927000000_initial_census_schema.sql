create extension if not exists pgcrypto with schema extensions;

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.agent_tiers (
  id smallint primary key,
  name text not null unique,
  rank smallint not null unique check (rank > 0),
  created_at timestamptz not null default now()
);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  region_id uuid not null references public.regions(id),
  tier_id smallint not null references public.agent_tiers(id),
  status text not null check (status in ('alive', 'dead')),
  born_at timestamptz not null,
  died_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'alive' and died_at is null) or (status = 'dead' and died_at is not null)),
  check (died_at is null or died_at >= born_at)
);

create table public.agent_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id),
  event_kind text not null check (event_kind in ('birth', 'death')),
  occurred_at timestamptz not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (agent_id, event_kind)
);

create table public.census_entries (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id),
  region_id uuid references public.regions(id),
  observed_at timestamptz not null default now(),
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.swarm_metrics (
  id uuid primary key default gen_random_uuid(),
  region_id uuid references public.regions(id),
  metric_name text not null,
  metric_value double precision not null,
  sample_count bigint not null default 1 check (sample_count > 0),
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.audit_spine (
  sequence bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid not null,
  previous_hash text check (previous_hash is null or previous_hash ~ '^[0-9a-f]{64}$'),
  entry_hash text not null unique check (entry_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index agents_region_tier_idx on public.agents (region_id, tier_id);
create index census_entries_observed_at_idx on public.census_entries (observed_at desc);
create index swarm_metrics_region_measured_idx on public.swarm_metrics (region_id, measured_at desc);

create function public.reject_audit_spine_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_spine is append-only';
end;
$$;

create trigger audit_spine_no_update_or_delete
before update or delete on public.audit_spine
for each row execute function public.reject_audit_spine_mutation();

create trigger audit_spine_no_truncate
before truncate on public.audit_spine
for each statement execute function public.reject_audit_spine_mutation();

alter table public.regions enable row level security;
alter table public.agent_tiers enable row level security;
alter table public.agents enable row level security;
alter table public.agent_lifecycle_events enable row level security;
alter table public.census_entries enable row level security;
alter table public.swarm_metrics enable row level security;
alter table public.audit_spine enable row level security;

revoke all on table
  public.regions,
  public.agent_tiers,
  public.agents,
  public.agent_lifecycle_events,
  public.census_entries,
  public.swarm_metrics,
  public.audit_spine
from public, anon, authenticated;

grant all on table
  public.regions,
  public.agent_tiers,
  public.agents,
  public.agent_lifecycle_events,
  public.census_entries,
  public.swarm_metrics,
  public.audit_spine
to service_role;

grant usage, select on sequence public.audit_spine_sequence_seq to service_role;