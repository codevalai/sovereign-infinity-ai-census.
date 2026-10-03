import { authorize, createAdminClient, isIsoDate, isRecord, jsonResponse } from '../_shared/lifecycle.ts';

Deno.serve(async (request) => {
  const authorizationError = await authorize(request);
  if (authorizationError) return authorizationError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON' }, 400);
  }

  if (!isRecord(body)
    || typeof body.externalId !== 'string'
    || body.externalId.trim().length < 1
    || body.externalId.length > 255
    || typeof body.regionCode !== 'string'
    || typeof body.tierName !== 'string'
    || (body.occurredAt !== undefined && !isIsoDate(body.occurredAt))
    || (body.details !== undefined && !isRecord(body.details))) {
    return jsonResponse({ error: 'Invalid agent birth payload' }, 400);
  }

  try {
    const supabase = createAdminClient();
    const [regionResult, tierResult] = await Promise.all([
      supabase.from('regions').select('id').eq('code', body.regionCode).single(),
      supabase.from('agent_tiers').select('id').eq('name', body.tierName).single(),
    ]);

    if (regionResult.error || tierResult.error) {
      return jsonResponse({ error: 'Unknown region or agent tier' }, 422);
    }

    const { data, error } = await supabase.rpc('register_agent_birth', {
      p_external_id: body.externalId.trim(),
      p_region_id: regionResult.data.id,
      p_tier_id: tierResult.data.id,
      p_occurred_at: isIsoDate(body.occurredAt) ? new Date(body.occurredAt).toISOString() : new Date().toISOString(),
      p_details: isRecord(body.details) ? body.details : {},
    });

    if (error || !data) {
      console.error('Agent birth RPC failed', error?.code);
      return jsonResponse({ error: 'Failed to register agent birth' }, 503);
    }

    return jsonResponse({ ok: true, agentId: data }, 201);
  } catch (error) {
    console.error('Agent birth webhook failed', error);
    return jsonResponse({ error: 'Agent birth service unavailable' }, 503);
  }
});