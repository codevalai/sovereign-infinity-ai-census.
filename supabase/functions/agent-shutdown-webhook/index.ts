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
    || typeof body.agentId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.agentId)
    || (body.occurredAt !== undefined && !isIsoDate(body.occurredAt))
    || (body.details !== undefined && !isRecord(body.details))) {
    return jsonResponse({ error: 'Invalid agent shutdown payload' }, 400);
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('register_agent_shutdown', {
      p_agent_id: body.agentId,
      p_occurred_at: isIsoDate(body.occurredAt) ? new Date(body.occurredAt).toISOString() : new Date().toISOString(),
      p_details: isRecord(body.details) ? body.details : {},
    });

    if (error || !data) {
      console.error('Agent shutdown RPC failed', error?.code);
      return jsonResponse({ error: 'Agent is not active or shutdown could not be recorded' }, 409);
    }

    return jsonResponse({ ok: true, agentId: data }, 200);
  } catch (error) {
    console.error('Agent shutdown webhook failed', error);
    return jsonResponse({ error: 'Agent shutdown service unavailable' }, 503);
  }
});