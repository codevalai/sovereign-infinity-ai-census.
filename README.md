# AI Census

AI Census is a server-side service for collecting machine telemetry, maintaining a machine registry, recording valuations, and serving an authenticated view of the latest census state. PostgreSQL is the system of record; Fastify provides the HTTP API, and Supabase supplies the managed database and service-role access.

This repository contains the API, database migrations, and Fly.io deployment configuration. It does not contain the GEV OS or Cod3Eval client applications.

## Capabilities

- Authenticated telemetry ingestion with strict request validation.
- Automatic machine registration on first telemetry, with monotonically maintained `last_seen_at`.
- Append-only valuation records linked to registered machines.
- Authenticated, paginated census reads combining registry data with each machine's latest telemetry and valuation.
- Anomaly records for invalid payloads, failed writes, first-seen machine IDs, and sustained telemetry spikes.
- An append-only audit log for inserts, updates, and deletes on census tables.
- Agent birth, shutdown, and append-only telemetry through transactional Supabase RPCs and authenticated Edge Functions.
- Row-level security with database access restricted to the server-side `service_role`.

## Data Model

The core entities are:

| Entity | Role |
| --- | --- |
| `machine_population` | Registry identity, classification, lifecycle status, and last-seen time. |
| `machine_telemetry` | Time-stamped autonomy, ethics, economic role, and optional location data. |
| `machine_valuation` | Time-stamped valuation, model, risk, and context multiplier. |
| `census_dashboard` | Read-only database view with one registry row and the latest telemetry and valuation. |
| `census_anomalies` | Operational records for malformed or suspicious ingestion events. |
| `census_audit_log` | Append-only snapshots of rows changed in census tables. |

Telemetry creates a registry row for a previously unseen machine. Each valuation request appends a new record; the dashboard view selects the latest evaluation. The audit log stores changed row data, including telemetry fields, and therefore needs an intentional retention and backup policy.

## API

All protected routes use bearer authentication. Configure distinct secrets for ingestion, reads, and valuations. The read and valuation routes are disabled until their respective keys are configured.

### `GET /health`

Checks connectivity with a small Supabase query. Returns `200` when available and `503` when the database cannot be reached. Fly.io uses this route for its machine health check.

### `POST /telemetry`

Requires `Authorization: Bearer $CENSUS_INGESTION_KEY`.

Required JSON fields:

| Field | Type | Constraints |
| --- | --- | --- |
| `machineId` | string | 1-255 characters; non-whitespace. |
| `autonomyLevel` | string or number | Strings are limited to 100 characters. |
| `ethicsProfile` | object | Required. |
| `economicRole` | string | 1-255 characters; non-whitespace. |

Optional fields are `geoLocation` (object) and `timestamp` (ISO 8601). Successful ingestion returns `201` with the telemetry record ID. Invalid payloads return `400`; an invalid bearer key returns `401`.

### `POST /valuation/update`

Requires `Authorization: Bearer $CENSUS_VALUATION_KEY` and an existing `machineId`. Each accepted request appends a valuation record and returns `201` with its ID.

| Field | Type | Constraints |
| --- | --- | --- |
| `machineId` | string | 1-255 characters; must already be registered. |
| `valuationUsd` | number | Non-negative. |
| `valuationModel` | string | 1-100 characters; non-whitespace. |
| `riskIndex` | number | 0-100. |
| `contextMultiplier` | number | 0-999999.9999. |
| `lastEvaluatedAt` | string | Optional ISO 8601 timestamp; defaults to the current time. |

Unknown machines return `404`. Invalid payloads return `400`; an invalid bearer key returns `401`.

### `GET /census/read`

Requires `Authorization: Bearer $CENSUS_READ_KEY`. Returns registry fields with the latest telemetry and valuation, plus pagination metadata. Responses use `Cache-Control: private, no-store`.

| Query parameter | Default | Accepted values |
| --- | --- | --- |
| `limit` | `50` | Integer from 1 to 100. |
| `offset` | `0` | Integer from 0 to 1,000,000. |
| `status` | None | `active`, `dormant`, `retired`, `banned`. |
| `kind` | None | `robot`, `agent`, `service`, `dataset`, `ip_asset`, `unknown`. |

The response has the form:

```json
{
	"data": [],
	"pagination": {
		"limit": 50,
		"offset": 0,
		"total": 0
	}
}
```

## Local Development

Requirements: Node.js 22 or later, npm, and a Supabase project or compatible local Supabase instance.

1. Install dependencies with `npm ci`.
2. Apply the Supabase migrations using the instructions in [DEPLOYMENT.md](DEPLOYMENT.md).
3. Provide `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a `CENSUS_INGESTION_KEY` of at least 32 characters. Set optional `CENSUS_READ_KEY` and `CENSUS_VALUATION_KEY` to enable their routes. Set `OPENAI_API_KEY` to run Astra or Dots. `.env.example` lists the variables.
4. Run the development server with `npm run dev`.

The service listens on port `8080` by default. Set `PORT` to override it.

Useful project commands:

```sh
npm run typecheck
npm run build
npm start
```

## Database Migrations

Migrations are applied in filename order from `supabase/migrations/`. Use `npx supabase db push` to apply pending migrations to a linked project. Review generated SQL and take a database backup according to your operational policy before applying schema changes to production.

The migration set enables RLS on census tables, revokes access from `public`, `anon`, and `authenticated`, and grants server-side access to `service_role`. The dashboard view is also restricted to `service_role`; do not expose the Supabase service-role key to browser clients.

The agent birth pipeline seeds the `global` region and the `astra`, `agent_o`, and `dot` tiers when absent. Birth and shutdown RPCs update `agents` and append the corresponding lifecycle event in one transaction. Set a separate `AGENT_LIFECYCLE_KEY` of at least 32 characters and deploy both functions:

```sh
npx supabase secrets set AGENT_LIFECYCLE_KEY=YOUR_RANDOM_SECRET OPENAI_API_KEY=YOUR_OPENAI_KEY ASTRA_API_KEY=ANOTHER_RANDOM_SECRET
npx supabase functions deploy agent-birth-webhook
npx supabase functions deploy agent-shutdown-webhook
npx supabase functions deploy agent-telemetry-webhook
npx supabase functions deploy astra-entrypoint
```

Requests use `Authorization: Bearer $AGENT_LIFECYCLE_KEY`. Example birth request:

```sh
curl -X POST "$SUPABASE_URL/functions/v1/agent-birth-webhook" \
	-H "Authorization: Bearer $AGENT_LIFECYCLE_KEY" \
	-H 'Content-Type: application/json' \
	-d '{"externalId":"astra-main","regionCode":"global","tierName":"astra"}'
```

Shutdown requests provide `agentId`. Telemetry requests provide `eventType` and an object `payload`; publish `queue_snapshot` events with a non-negative integer `pendingTasks` field to drive Agent-O. Agent-O reads the latest queue snapshot and starts no more than five sequential Dot tasks per invocation. Astra is available at `/functions/v1/astra-entrypoint` using `ASTRA_API_KEY`. The `OPENAI_API_KEY` and `ASTRA_API_KEY` values belong in Supabase Edge Function secrets, not browser code. The local TypeScript entry points under `src/agents` use `OPENAI_API_KEY` and the server-side Supabase credentials.

Publish a queue snapshot with the lifecycle key:

```sh
curl -X POST "$SUPABASE_URL/functions/v1/agent-telemetry-webhook" \
	-H "Authorization: Bearer $AGENT_LIFECYCLE_KEY" \
	-H 'Content-Type: application/json' \
	-d '{"eventType":"queue_snapshot","payload":{"pendingTasks":1200}}'
```

## Deployment

Fly.io configuration is in [fly.toml](fly.toml); deployment and secret setup are documented in [DEPLOYMENT.md](DEPLOYMENT.md). `force_https` is enabled. The service uses HTTPS to connect to Supabase when configured with the project's HTTPS URL.

## Operational Considerations

- An anomaly is recorded when a machine reaches 120 or more telemetry inserts within a rolling one-minute window. This logs the spike; it does not reject or throttle the requests.
- Malformed payloads and database write failures produce sanitized anomaly metadata when Supabase is reachable; if anomaly persistence also fails, the service logs that failure. Raw request bodies are not stored. Anomalies and audit records are accessible only with server-side database credentials.
- Credential rotation must update each producer or consumer together with Fly secrets. Automated rotation is not configured because this repository has no producer deployments or secret synchronization targets.
- Fly enforces HTTPS redirects, but this repository does not configure a minimum TLS protocol version. Confirm the TLS policy available from your hosting edge for your deployment.
- The read and valuation APIs are bearer-key protected, not public APIs. Do not embed their keys in browser applications; place a trusted application service between browser clients and these routes.

## Repository Layout

```text
src/                    Fastify service, agents, configuration, and Supabase types
supabase/functions/     Authenticated agent lifecycle Edge Functions
supabase/migrations/    Ordered PostgreSQL schema migrations
DEPLOYMENT.md           Supabase and Fly.io deployment procedure
fly.toml                Fly.io application and health-check configuration
Dockerfile              Production container build
```
