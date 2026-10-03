import OpenAI from 'npm:openai@7';
import { authorize, createAdminClient, isRecord, jsonResponse } from '../_shared/lifecycle.ts';

Deno.serve(async (request) => {
  const authorizationError = await authorize(request, 'ASTRA_API_KEY');
  if (authorizationError) return authorizationError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON' }, 400);
  }
  if (!isRecord(body) || typeof body.input !== 'string' || body.input.trim().length === 0 || body.input.length > 16000) {
    return jsonResponse({ error: 'input must be a non-empty string of at most 16000 characters' }, 400);
  }

  const supabase = createAdminClient();
  const [regionResult, tierResult] = await Promise.all([
    supabase.from('regions').select('id').eq('code', 'global').single(),
    supabase.from('agent_tiers').select('id').eq('name', 'astra').single(),
  ]);
  if (regionResult.error || tierResult.error) {
    return jsonResponse({ error: 'Astra agent registry is not provisioned' }, 503);
  }

  const { data: agentId, error: birthError } = await supabase.rpc('register_agent_birth', {
    p_external_id: `astra-${crypto.randomUUID()}`,
    p_region_id: regionResult.data.id,
    p_tier_id: tierResult.data.id,
    p_details: { factory_source: 'edge_function' },
  });
  if (birthError || !agentId) {
    console.error('Astra birth RPC failed', birthError?.code);
    return jsonResponse({ error: 'Astra session could not be registered' }, 503);
  }

  let response: Response;
  let outcome: 'completed' | 'failed' = 'completed';
  try {
    const client = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
    const completion = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: 'You are Astra, the front-door agent for the Sovereign Infinity census.' },
        { role: 'user', content: body.input },
      ],
    });
    const { error: telemetryError } = await supabase.from('agent_telemetry').insert({
      agent_id: agentId,
      event_type: 'tool_call',
      payload: {
        model: 'gpt-4.1-mini',
        prompt_tokens: completion.usage?.prompt_tokens ?? 0,
        completion_tokens: completion.usage?.completion_tokens ?? 0,
      },
    });
    if (telemetryError) throw telemetryError;
    response = jsonResponse({ output: completion.choices[0]?.message.content ?? null });
  } catch (error) {
    outcome = 'failed';
    console.error('Astra completion failed', error);
    response = jsonResponse({ error: 'Astra request failed' }, 502);
  }

  const { error: shutdownError } = await supabase.rpc('register_agent_shutdown', {
    p_agent_id: agentId,
    p_details: { outcome },
  });
  if (shutdownError) {
    console.error('Astra shutdown RPC failed', shutdownError.code);
    return jsonResponse({ error: 'Astra session shutdown could not be recorded' }, 503);
  }

  return response;
});