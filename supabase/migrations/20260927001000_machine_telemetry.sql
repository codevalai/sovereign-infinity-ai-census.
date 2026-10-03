create table public.machine_telemetry (
  id uuid primary key default gen_random_uuid(),
  machine_id text not null check (length(btrim(machine_id)) between 1 and 255),
  autonomy_level jsonb not null check (jsonb_typeof(autonomy_level) in ('string', 'number')),
  ethics_profile jsonb not null default '{}'::jsonb check (jsonb_typeof(ethics_profile) = 'object'),
  economic_role text not null check (length(btrim(economic_role)) between 1 and 255),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index machine_telemetry_machine_observed_idx
  on public.machine_telemetry (machine_id, observed_at desc);

alter table public.machine_telemetry enable row level security;

revoke all on table public.machine_telemetry from public, anon, authenticated;
grant all on table public.machine_telemetry to service_role;