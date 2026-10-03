create view public.census_dashboard
with (security_invoker = true)
as
select
  population.machine_id,
  population.kind,
  population.origin,
  population.status,
  population.created_at,
  population.last_seen_at,
  telemetry.id as telemetry_id,
  telemetry.autonomy_level,
  telemetry.ethics_profile,
  telemetry.economic_role,
  telemetry.geo_location,
  telemetry.observed_at,
  valuation.id as valuation_id,
  valuation.valuation_usd,
  valuation.valuation_model,
  valuation.risk_index,
  valuation.context_multiplier,
  valuation.last_evaluated_at
from public.machine_population as population
left join lateral (
  select
    event.id,
    event.autonomy_level,
    event.ethics_profile,
    event.economic_role,
    event.geo_location,
    event.observed_at
  from public.machine_telemetry as event
  where event.machine_id = population.machine_id
  order by event.observed_at desc, event.created_at desc, event.id desc
  limit 1
) as telemetry on true
left join lateral (
  select
    record.id,
    record.valuation_usd,
    record.valuation_model,
    record.risk_index,
    record.context_multiplier,
    record.last_evaluated_at
  from public.machine_valuation as record
  where record.machine_id = population.machine_id
  order by record.last_evaluated_at desc, record.created_at desc, record.id desc
  limit 1
) as valuation on true;

revoke all on table public.census_dashboard from public, anon, authenticated;
grant select on table public.census_dashboard to service_role;