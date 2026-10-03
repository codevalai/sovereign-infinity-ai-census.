import type { Json } from '../database.types.js';
import { supabase } from '../supabase.js';

export type AgentTelemetryEvent =
  | 'tool_call'
  | 'task_completed'
  | 'task_failed'
  | 'queue_snapshot'
  | 'pending_task'
  | 'orchestration';

export async function recordAgentTelemetry(
  agentId: string | null,
  eventType: AgentTelemetryEvent,
  payload: Record<string, Json>,
): Promise<void> {
  const { error } = await supabase.from('agent_telemetry').insert({
    agent_id: agentId,
    event_type: eventType,
    payload,
  });

  if (error) {
    throw new Error('Agent telemetry could not be recorded');
  }
}

export async function getTelemetrySnapshot(): Promise<{ pendingTasks: number }> {
  const { data, error } = await supabase
    .from('agent_telemetry')
    .select('payload')
    .eq('event_type', 'queue_snapshot')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error('Agent telemetry snapshot could not be read');
  }

  const pendingTasks = data?.payload && typeof data.payload === 'object' && !Array.isArray(data.payload)
    ? data.payload.pendingTasks
    : undefined;

  return {
    pendingTasks: typeof pendingTasks === 'number' && Number.isSafeInteger(pendingTasks) && pendingTasks >= 0
      ? pendingTasks
      : 0,
  };
}