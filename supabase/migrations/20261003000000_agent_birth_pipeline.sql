insert into public.regions (code, name)
values ('global', 'Global')
on conflict (code) do nothing;

do $$
declare
  tier_record record;
  next_id smallint;
  next_rank smallint;
begin
  for tier_record in
    select * from (values ('astra'::text, 1), ('agent_o'::text, 2), ('dot'::text, 3)) as defaults(name, rank)
    order by rank
  loop
    if not exists (select 1 from public.agent_tiers where name = tier_record.name) then
      select coalesce(max(id), 0) + 1 into next_id from public.agent_tiers;
      select coalesce(max(rank), 0) + 1 into next_rank from public.agent_tiers;
      insert into public.agent_tiers (id, name, rank)
      values (next_id, tier_record.name, next_rank);
    end if;
  end loop;
end;
$$;

create table public.agent_telemetry (
  id bigint generated always as identity primary key,
  agent_id uuid references public.agents(id),
  event_type text not null check (event_type in (
    'spawn',
    'shutdown',
    'tool_call',
    'task_completed',
    'task_failed',
    'queue_snapshot',
    'pending_task',
    'orchestration'
  )),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index agent_telemetry_event_occurred_idx
  on public.agent_telemetry (event_type, occurred_at desc);
create index agent_telemetry_agent_occurred_idx
  on public.agent_telemetry (agent_id, occurred_at desc);

alter table public.agent_telemetry enable row level security;
revoke all on table public.agent_telemetry from public, anon, authenticated;
grant all on table public.agent_telemetry to service_role;
grant usage, select on sequence public.agent_telemetry_id_seq to service_role;

create trigger agent_telemetry_census_audit
after insert on public.agent_telemetry
for each row execute function public.capture_census_audit();

create function public.reject_agent_telemetry_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'agent_telemetry is append-only';
end;
$$;

create trigger agent_telemetry_no_update_or_delete
before update or delete on public.agent_telemetry
for each row execute function public.reject_agent_telemetry_mutation();

create trigger agent_telemetry_no_truncate
before truncate on public.agent_telemetry
for each statement execute function public.reject_agent_telemetry_mutation();

create function public.capture_agent_lifecycle_telemetry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.agent_telemetry (agent_id, event_type, payload, occurred_at)
  values (
    new.agent_id,
    case new.event_kind when 'birth' then 'spawn' else 'shutdown' end,
    jsonb_build_object('lifecycle_event_id', new.id, 'details', new.details),
    new.occurred_at
  );
  return new;
end;
$$;

create trigger agent_lifecycle_telemetry
after insert on public.agent_lifecycle_events
for each row execute function public.capture_agent_lifecycle_telemetry();

create function public.register_agent_birth(
  p_external_id text,
  p_region_id uuid,
  p_tier_id smallint,
  p_occurred_at timestamptz default now(),
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_agent_id uuid;
begin
  insert into public.agents (external_id, region_id, tier_id, status, born_at)
  values (p_external_id, p_region_id, p_tier_id, 'alive', p_occurred_at)
  returning id into new_agent_id;

  insert into public.agent_lifecycle_events (agent_id, event_kind, occurred_at, details)
  values (new_agent_id, 'birth', p_occurred_at, coalesce(p_details, '{}'::jsonb));

  return new_agent_id;
end;
$$;

create function public.register_agent_shutdown(
  p_agent_id uuid,
  p_occurred_at timestamptz default now(),
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  shutdown_agent_id uuid;
begin
  update public.agents
  set status = 'dead', died_at = p_occurred_at
  where id = p_agent_id and status = 'alive' and born_at <= p_occurred_at
  returning id into shutdown_agent_id;

  if shutdown_agent_id is null then
    raise exception 'agent is not alive or shutdown time precedes birth';
  end if;

  insert into public.agent_lifecycle_events (agent_id, event_kind, occurred_at, details)
  values (shutdown_agent_id, 'death', p_occurred_at, coalesce(p_details, '{}'::jsonb));

  return shutdown_agent_id;
end;
$$;

revoke all on function public.register_agent_birth(text, uuid, smallint, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function public.register_agent_shutdown(uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.register_agent_birth(text, uuid, smallint, timestamptz, jsonb)
  to service_role;
grant execute on function public.register_agent_shutdown(uuid, timestamptz, jsonb)
  to service_role;