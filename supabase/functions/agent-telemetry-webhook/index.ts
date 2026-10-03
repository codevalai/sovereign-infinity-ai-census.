import { authorize, createAdminClient, isRecord, jsonResponse } from '../_shared/lifecycle.ts';

const supportedEvents = new Set([
  'tool_call',
  'task_completed',
  'task_failed',
  'queue_snapshot',
  'pending_task',
  'orchestration',
]);

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
    || typeof body.eventType !== 'string'
    || !supportedEvents.has(body.eventType)
    || (body.agentId !== undefined && (typeof body.agentId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.agentId)))
    || !isRecord(body.payload)
    || (body.eventType === 'queue_snapshot'
      && (!Number.isSafeInteger(body.payload.pendingTasks) || (body.payload.pendingTasks as number) < 0))) {
    return jsonResponse({ error: 'Invalid agent telemetry payload' }, 400);
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('agent_telemetry').insert({
      agent_id: typeof body.agentId === 'string' ? body.agentId : null,
      event_type: body.eventType,
      payload: body.payload,
    }).select('id').single();

    if (error || !data) {
      console.error('Agent telemetry insert failed', error?.code);
      return jsonResponse({ error: 'Failed to record agent telemetry' }, 503);
    }

    return jsonResponse({ ok: true, id: data.id }, 201);
  } catch (error) {
    console.error('Agent telemetry webhook failed', error);
    return jsonResponse({ error: 'Agent telemetry service unavailable' }, 503);
  }
});