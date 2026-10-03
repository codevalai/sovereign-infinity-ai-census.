create table public.census_anomalies (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'invalid_payload',
    'telemetry_insert_failed',
    'unknown_machine_id',
    'telemetry_rate_spike',
    'valuation_insert_failed'
  )),
  machine_id text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index census_anomalies_machine_created_idx
  on public.census_anomalies (machine_id, created_at desc);

alter table public.census_anomalies enable row level security;
revoke all on table public.census_anomalies from public, anon, authenticated;
grant all on table public.census_anomalies to service_role;

create or replace function public.track_machine_telemetry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  first_seen boolean;
begin
  select not exists (
    select 1
    from public.machine_population as population
    where population.machine_id = new.machine_id
  ) into first_seen;

  insert into public.machine_population as population (machine_id, last_seen_at)
  values (new.machine_id, new.observed_at)
  on conflict (machine_id) do update
    set last_seen_at = greatest(population.last_seen_at, excluded.last_seen_at);

  if first_seen then
    insert into public.census_anomalies (event_type, machine_id, details)
    values (
      'unknown_machine_id',
      new.machine_id,
      jsonb_build_object('observed_at', new.observed_at)
    );
  end if;

  return new;
end;
$$;

create function public.detect_telemetry_rate_spike()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  events_in_window integer;
begin
  select count(*) into events_in_window
  from public.machine_telemetry as telemetry
  where telemetry.machine_id = new.machine_id
    and telemetry.created_at >= now() - interval '1 minute';

  if events_in_window >= 120 and not exists (
    select 1
    from public.census_anomalies as anomaly
    where anomaly.machine_id = new.machine_id
      and anomaly.event_type = 'telemetry_rate_spike'
      and anomaly.created_at >= now() - interval '1 minute'
  ) then
    insert into public.census_anomalies (event_type, machine_id, details)
    values (
      'telemetry_rate_spike',
      new.machine_id,
      jsonb_build_object('events_per_minute', events_in_window, 'threshold', 120)
    );
  end if;

  return new;
end;
$$;

create index machine_telemetry_machine_created_idx
  on public.machine_telemetry (machine_id, created_at desc);

create trigger machine_telemetry_detect_rate_spike
after insert on public.machine_telemetry
for each row execute function public.detect_telemetry_rate_spike();

create table public.census_audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  before_data jsonb,
  after_data jsonb,
  actor_role text not null,
  occurred_at timestamptz not null default now()
);

create index census_audit_log_occurred_idx on public.census_audit_log (occurred_at desc);

alter table public.census_audit_log enable row level security;
revoke all on table public.census_audit_log from public, anon, authenticated;
grant all on table public.census_audit_log to service_role;

create function public.capture_census_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb;
  after_row jsonb;
begin
  if tg_op <> 'INSERT' then
    before_row := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    after_row := to_jsonb(new);
  end if;

  insert into public.census_audit_log (table_name, operation, before_data, after_data, actor_role)
  values (
    tg_table_schema || '.' || tg_table_name,
    tg_op,
    before_row,
    after_row,
    coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), session_user)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'regions',
    'agent_tiers',
    'agents',
    'agent_lifecycle_events',
    'census_entries',
    'swarm_metrics',
    'audit_spine',
    'machine_telemetry',
    'machine_population',
    'machine_valuation',
    'census_anomalies'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.capture_census_audit()',
      table_name || '_census_audit',
      table_name
    );
  end loop;
end;
$$;

create function public.reject_census_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'census_audit_log is append-only';
end;
$$;

create trigger census_audit_log_no_update_or_delete
before update or delete on public.census_audit_log
for each row execute function public.reject_census_audit_mutation();

create trigger census_audit_log_no_truncate
before truncate on public.census_audit_log
for each statement execute function public.reject_census_audit_mutation();