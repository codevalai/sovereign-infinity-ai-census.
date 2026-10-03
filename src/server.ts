import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { supabase } from './supabase.js';
import type { Json } from './database.types.js';

const app = Fastify({ logger: true });

interface TelemetryPayload {
  machineId: string;
  autonomyLevel: string | number;
  ethicsProfile: Record<string, Json>;
  economicRole: string;
  geoLocation?: Record<string, Json>;
  timestamp?: string;
}

interface ValuationPayload {
  machineId: string;
  valuationUsd: number;
  valuationModel: string;
  riskIndex: number;
  contextMultiplier: number;
  lastEvaluatedAt?: string;
}

function hasValidBearerKey(authorization: string | undefined, expectedKey: string | undefined): boolean {
  if (!expectedKey) {
    return false;
  }

  const [scheme, token, ...extraParts] = authorization?.split(' ') ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !token || extraParts.length > 0) {
    return false;
  }

  const providedKey = Buffer.from(token);
  const expectedKeyBuffer = Buffer.from(expectedKey);
  return providedKey.length === expectedKeyBuffer.length && timingSafeEqual(providedKey, expectedKeyBuffer);
}

function machineIdFromBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('machineId' in body)) {
    return null;
  }
  const machineId = body.machineId;
  return typeof machineId === 'string' ? machineId.slice(0, 255) : null;
}

async function recordAnomaly(
  eventType: string,
  machineId: string | null,
  details: Json,
): Promise<void> {
  const { error } = await supabase
    .from('census_anomalies')
    .insert({ event_type: eventType, machine_id: machineId, details });

  if (error) {
    app.log.error({ err: error, eventType }, 'Failed to persist census anomaly');
  }
}

app.addHook('onError', async (request, _reply, error) => {
  const endpoint = request.url.split('?')[0];
  if (error.statusCode === 400 && (endpoint === '/telemetry' || endpoint === '/valuation/update')) {
    await recordAnomaly('invalid_payload', machineIdFromBody(request.body), {
      endpoint: endpoint === '/telemetry' ? 'telemetry' : 'valuation',
      phase: 'parsing',
    });
  }
});

app.get('/health', async (_request, reply) => {
  const { error } = await supabase
    .from('census_entries')
    .select('id')
    .limit(1);

  if (error) {
    app.log.error({ err: error }, 'Supabase health check failed');
    return reply.code(503).send({ status: 'unavailable' });
  }

  return { status: 'ok' };
});

app.post<{ Body: TelemetryPayload }>(
  '/telemetry',
  {
    attachValidation: true,
    onRequest: async (request, reply) => {
      if (!hasValidBearerKey(request.headers.authorization, config.censusIngestionKey)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    },
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['machineId', 'autonomyLevel', 'ethicsProfile', 'economicRole'],
        properties: {
          machineId: { type: 'string', minLength: 1, maxLength: 255, pattern: '\\S' },
          autonomyLevel: {
            anyOf: [
              { type: 'string', minLength: 1, maxLength: 100 },
              { type: 'number' },
            ],
          },
          ethicsProfile: { type: 'object' },
          economicRole: { type: 'string', minLength: 1, maxLength: 255, pattern: '\\S' },
          geoLocation: { type: 'object' },
          timestamp: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$',
          },
        },
      },
    },
  },
  async (request, reply) => {
    if (request.validationError) {
      await recordAnomaly('invalid_payload', machineIdFromBody(request.body), { endpoint: 'telemetry' });
      return reply.code(400).send({ error: 'Invalid telemetry payload' });
    }

    const observedAt = request.body.timestamp
      ? new Date(request.body.timestamp)
      : new Date();
    if (Number.isNaN(observedAt.getTime())) {
      await recordAnomaly('invalid_payload', request.body.machineId, { endpoint: 'telemetry', field: 'timestamp' });
      return reply.code(400).send({ error: 'timestamp must be a valid ISO 8601 date' });
    }

    const { data, error } = await supabase
      .from('machine_telemetry')
      .insert({
        machine_id: request.body.machineId,
        autonomy_level: request.body.autonomyLevel,
        ethics_profile: request.body.ethicsProfile,
        economic_role: request.body.economicRole,
        geo_location: request.body.geoLocation ?? null,
        observed_at: observedAt.toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      app.log.error({ err: error }, 'Telemetry ingestion failed');
      await recordAnomaly('telemetry_insert_failed', request.body.machineId, { database_code: error.code ?? 'unknown' });
      return reply.code(503).send({ error: 'Failed to store telemetry' });
    }

    return reply.code(201).send({ ok: true, id: data.id });
  },
);

app.post<{ Body: ValuationPayload }>(
  '/valuation/update',
  {
    attachValidation: true,
    onRequest: async (request, reply) => {
      if (!config.censusValuationKey) {
        return reply.code(503).send({ error: 'Valuation updates are not configured' });
      }
      if (!hasValidBearerKey(request.headers.authorization, config.censusValuationKey)) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    },
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['machineId', 'valuationUsd', 'valuationModel', 'riskIndex', 'contextMultiplier'],
        properties: {
          machineId: { type: 'string', minLength: 1, maxLength: 255, pattern: '\\S' },
          valuationUsd: { type: 'number', minimum: 0, maximum: 999999999999999999 },
          valuationModel: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
          riskIndex: { type: 'number', minimum: 0, maximum: 100 },
          contextMultiplier: { type: 'number', minimum: 0, maximum: 999999.9999 },
          lastEvaluatedAt: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$',
          },
        },
      },
    },
  },
  async (request, reply) => {
    if (request.validationError) {
      await recordAnomaly('invalid_payload', machineIdFromBody(request.body), { endpoint: 'valuation' });
      return reply.code(400).send({ error: 'Invalid valuation payload' });
    }

    const lastEvaluatedAt = request.body.lastEvaluatedAt
      ? new Date(request.body.lastEvaluatedAt)
      : new Date();
    if (Number.isNaN(lastEvaluatedAt.getTime())) {
      await recordAnomaly('invalid_payload', request.body.machineId, { endpoint: 'valuation', field: 'lastEvaluatedAt' });
      return reply.code(400).send({ error: 'lastEvaluatedAt must be a valid ISO 8601 date' });
    }

    const { data, error } = await supabase
      .from('machine_valuation')
      .insert({
        machine_id: request.body.machineId,
        valuation_usd: request.body.valuationUsd,
        valuation_model: request.body.valuationModel,
        risk_index: request.body.riskIndex,
        context_multiplier: request.body.contextMultiplier,
        last_evaluated_at: lastEvaluatedAt.toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      app.log.error({ err: error }, 'Valuation update failed');
      await recordAnomaly('valuation_insert_failed', request.body.machineId, { database_code: error.code ?? 'unknown' });
      if (error.code === '23503') {
        return reply.code(404).send({ error: 'Machine is not registered' });
      }
      return reply.code(503).send({ error: 'Failed to store valuation' });
    }

    return reply.code(201).send({ ok: true, id: data.id });
  },
);

interface CensusReadQuery {
  limit?: number;
  offset?: number;
  status?: string;
  kind?: string;
}

app.get<{ Querystring: CensusReadQuery }>(
  '/census/read',
  {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          offset: { type: 'integer', minimum: 0, maximum: 1000000 },
          status: { type: 'string', enum: ['active', 'dormant', 'retired', 'banned'] },
          kind: { type: 'string', enum: ['robot', 'agent', 'service', 'dataset', 'ip_asset', 'unknown'] },
        },
      },
    },
  },
  async (request, reply) => {
    reply.header('cache-control', 'private, no-store');
    if (!config.censusReadKey) {
      return reply.code(503).send({ error: 'Census read endpoint is not configured' });
    }
    if (!hasValidBearerKey(request.headers.authorization, config.censusReadKey)) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const limit = request.query.limit ?? 50;
    const offset = request.query.offset ?? 0;
    let query = supabase
      .from('census_dashboard')
      .select('*', { count: 'exact' })
      .order('machine_id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (request.query.status) {
      query = query.eq('status', request.query.status);
    }
    if (request.query.kind) {
      query = query.eq('kind', request.query.kind);
    }

    const { data, count, error } = await query;
    if (error) {
      app.log.error({ err: error }, 'Census read failed');
      return reply.code(503).send({ error: 'Failed to read census' });
    }

    return {
      data,
      pagination: { limit, offset, total: count ?? 0 },
    };
  },
);

try {
  await app.listen({ host: '0.0.0.0', port: config.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}