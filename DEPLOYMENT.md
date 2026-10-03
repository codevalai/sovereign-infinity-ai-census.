# Supabase and Fly.io Deployment

This guide provisions the database and API for the first time, applies schema changes, deploys the service, and verifies its health. Keep credentials in an approved secret manager. Never commit production keys or expose the Supabase service-role key in browser code.

## Connect Supabase to GitHub

In the Supabase dashboard, open **Project → Settings → Integrations → GitHub** and connect `codevalai/sovereign-infinity-ai-census`. Set the working directory to `.` and the production branch to `main`, then enable the production deployment integration. Confirm the integration's generated workflow and deployment status before relying on pushes to apply database changes; the CLI migration procedure below remains the explicit fallback and verification path.

## 1. Provision Supabase

Create a Supabase project and select PostgreSQL 17. The local Supabase configuration is also pinned to major version 17. Record the project reference and the server-side service-role key from the Supabase project settings.

Install or run the Supabase CLI, authenticate, and link the repository:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

Review pending migrations, then apply them to the linked project:

```sh
npx supabase migration list --linked
npx supabase db push
npx supabase gen types typescript --linked --schema public > src/database.types.ts
npm run typecheck
```

The migrations create the census, registry, telemetry, valuation, anomaly, and audit structures. Row-level security is enabled without access for `public`, `anon`, or `authenticated`; the server's `service_role` is the only API role granted access. The service-role key bypasses RLS and must remain server-side. Audit entries contain before/after row data; establish retention, backup, and access-review policies before high-volume production use.

After applying migrations, configure Edge Function secrets and deploy the agent endpoints:

```sh
npx supabase secrets set \
	AGENT_LIFECYCLE_KEY=YOUR_RANDOM_SECRET \
	ASTRA_API_KEY=ANOTHER_RANDOM_SECRET \
	OPENAI_API_KEY=YOUR_OPENAI_KEY
npx supabase functions deploy agent-birth-webhook
npx supabase functions deploy agent-shutdown-webhook
npx supabase functions deploy agent-telemetry-webhook
npx supabase functions deploy astra-entrypoint
```

Use independently generated secrets of at least 32 characters. Publish `queue_snapshot` telemetry with `pendingTasks` to supply Agent-O's input. To invoke Agent-O manually from a configured Node.js environment, build and run `npm run agent:o`; each run starts no more than five sequential Dots. No schedule is enabled by default. If scheduling it through GitHub Actions or another trusted runner, configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CENSUS_INGESTION_KEY`, and `OPENAI_API_KEY` as runner secrets and account for model usage before choosing a cadence.

## 2. Prepare Fly.io

Install the Fly CLI on Linux, verify it is available in your shell, and authenticate:

```sh
curl -L https://fly.io/install.sh | sh
export FLYCTL_INSTALL="$HOME/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"
fly version
fly auth login
```

For a new application, create the Fly app using the repository configuration. Skip this command if `ai-census` already exists in the target organization:

```sh
fly launch --no-deploy --name ai-census --region iad
```

Generate three independent secrets of at least 32 characters with an approved password manager or secret manager. The ingestion secret must also be provisioned to the telemetry producer; the read and valuation secrets belong only in their trusted server-side consumers. Configure the Supabase URL using its HTTPS endpoint and set all values as Fly secrets:

```sh
fly secrets set \
	SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
	SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_SIDE_SERVICE_ROLE_KEY \
	CENSUS_INGESTION_KEY=YOUR_INGESTION_SECRET \
	CENSUS_READ_KEY=YOUR_READ_SECRET \
	CENSUS_VALUATION_KEY=YOUR_VALUATION_SECRET \
	-a ai-census
```

`CENSUS_INGESTION_KEY` is required for startup. Read and valuation keys are optional, but their routes return `503` until configured. Use separate random values for all three.

## 3. Deploy and Verify

Run deployment from the repository root so Fly uses the directory containing `package.json`, `package-lock.json`, and `Dockerfile` as its build context. The explicit `.` prevents a different working directory from being used accidentally:

```sh
test -f package.json && test -f package-lock.json && test -f Dockerfile
fly deploy . -a ai-census
fly status -a ai-census
fly logs -a ai-census
```

The service listens on `0.0.0.0:8080`. `fly.toml` enables HTTPS redirects and checks `/health`; health is reported only when the database query succeeds. Verify the public health endpoint:

```sh
curl --fail https://ai-census.fly.dev/health
```

Expected response:

```json
{"status":"ok"}
```

Verify protected-route authorization without sending credentials:

```sh
curl -i https://ai-census.fly.dev/census/read
```

Expected status is `401` when `CENSUS_READ_KEY` is configured, or `503` when the route is disabled. Check `fly logs` if the health check or request fails. The hostname may differ if the Fly app uses a custom domain.

## API Contracts

`POST /telemetry` requires `Authorization: Bearer YOUR_INGESTION_SECRET`. JSON fields: `machineId`, `autonomyLevel`, `ethicsProfile`, and `economicRole`; optional fields are `geoLocation` and ISO 8601 `timestamp`. A first telemetry event registers the machine and advances `last_seen_at` monotonically.

`GET /census/read` requires `Authorization: Bearer YOUR_READ_SECRET`. Optional query parameters: `limit` (1-100, default 50), `offset` (default 0), `status` (`active`, `dormant`, `retired`, `banned`), and `kind` (`robot`, `agent`, `service`, `dataset`, `ip_asset`, `unknown`). The response contains each machine with its latest telemetry and valuation, plus pagination totals. Responses are marked `private, no-store`.

`POST /valuation/update` requires `Authorization: Bearer YOUR_VALUATION_SECRET` and a registered machine. Required JSON fields: `machineId`, non-negative `valuationUsd`, non-empty `valuationModel` (maximum 100 characters), `riskIndex` (0-100), and non-negative `contextMultiplier` (maximum 999999.9999). Optional `lastEvaluatedAt` is an ISO 8601 timestamp. Each request appends a valuation record; an unknown machine returns `404`.

Invalid payloads and failed writes produce sanitized anomaly metadata when Supabase is reachable; raw request bodies are not stored. A machine producing at least 120 telemetry inserts in one minute generates a rate-spike anomaly; this records the event but does not throttle ingestion. Database audit and anomaly tables are restricted to server-side access.

## Credential Rotation and TLS

Rotate a key as a coordinated operation: update the producer or consumer secret and the corresponding Fly secret in the same change window, then verify traffic before retiring the previous value. This repository does not contain producer deployments or secret-sync targets, so unattended rotation is not configured; rotating Fly alone would invalidate clients. Fly enforces HTTPS redirects, and the API should use the Supabase HTTPS endpoint. The minimum TLS version is controlled by the hosting edge and is not configured in this repository.

## Local Supabase

With the Supabase CLI installed, start the local stack and apply migrations:

```sh
npx supabase start
npx supabase db reset
```

The local database uses PostgreSQL 17 as specified in `supabase/config.toml`. See [README.md](README.md) for application requirements and development commands.