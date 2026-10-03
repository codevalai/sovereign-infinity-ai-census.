create table public.machine_population (
  id uuid primary key default gen_random_uuid(),
  machine_id text not null unique check (length(btrim(machine_id)) between 1 and 255),
  kind text not null default 'unknown'
    check (kind in ('robot', 'agent', 'service', 'dataset', 'ip_asset', 'unknown')),
  origin text not null default 'unknown'
    check (origin in ('lab', 'company', 'open-source', 'sovereign', 'unknown')),
  status text not null default 'active'
    check (status in ('active', 'dormant', 'retired', 'banned')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

insert into public.machine_population (machine_id, created_at, last_seen_at)
select machine_id, min(created_at), max(observed_at)
from public.machine_telemetry
group by machine_id;

alter table public.machine_telemetry
  add constraint machine_telemetry_machine_id_fkey
  foreign key (machine_id) references public.machine_population (machine_id);

alter table public.machine_telemetry
  add column geo_location jsonb
  check (geo_location is null or jsonb_typeof(geo_location) = 'object');

create function public.track_machine_telemetry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.machine_population as population (machine_id, last_seen_at)
  values (new.machine_id, new.observed_at)
  on conflict (machine_id) do update
    set last_seen_at = greatest(population.last_seen_at, excluded.last_seen_at);
  return new;
end;
$$;

create trigger machine_telemetry_track_machine
before insert on public.machine_telemetry
for each row execute function public.track_machine_telemetry();

create table public.machine_valuation (
  id uuid primary key default gen_random_uuid(),
  machine_id text not null references public.machine_population (machine_id),
  valuation_usd numeric(20, 2) not null check (valuation_usd >= 0),
  valuation_model text not null check (length(btrim(valuation_model)) between 1 and 100),
  risk_index numeric(5, 2) not null check (risk_index between 0 and 100),
  context_multiplier numeric(10, 4) not null check (context_multiplier >= 0),
  last_evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index machine_population_status_idx on public.machine_population (status);
create index machine_valuation_machine_evaluated_idx
  on public.machine_valuation (machine_id, last_evaluated_at desc);

alter table public.machine_population enable row level security;
alter table public.machine_valuation enable row level security;

revoke all on table public.machine_population, public.machine_valuation
from public, anon, authenticated;
grant all on table public.machine_population, public.machine_valuation to service_role;