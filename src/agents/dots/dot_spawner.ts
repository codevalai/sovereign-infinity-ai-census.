import { randomUUID } from 'node:crypto';
import type { Json } from '../../database.types.js';
import { registerAgentBirth, registerAgentShutdown } from '../agent_registry.js';
import { recordAgentTelemetry } from '../telemetry_client.js';
import { runDot } from './dot_template.js';

export interface SpawnDotOptions {
  taskType: string;
  prompt: string;
  parentAgentId?: string;
}

export async function spawnDot(options: SpawnDotOptions): Promise<{ agentId: string; result: string | null }> {
  const agentId = await registerAgentBirth({
    externalId: `dot-${randomUUID()}`,
    tierName: 'dot',
    details: {
      task_type: options.taskType,
      parent_agent_id: options.parentAgentId ?? null,
      factory_source: 'agent_o',
    },
  });

  let result: string | null = null;
  let taskError: unknown;
  try {
    result = await runDot({ prompt: options.prompt });
  } catch (error) {
    taskError = error;
  }

  try {
    await recordAgentTelemetry(agentId, taskError ? 'task_failed' : 'task_completed', {
      task_type: options.taskType,
      output_characters: result?.length ?? 0,
    });
  } catch (telemetryError) {
    taskError = taskError
      ? new AggregateError([taskError, telemetryError], 'Dot task and telemetry recording failed')
      : telemetryError;
  }

  try {
    await registerAgentShutdown(agentId, {
      task_type: options.taskType,
      outcome: taskError ? 'failed' : 'completed',
    });
  } catch (shutdownError) {
    if (taskError) {
      throw new AggregateError([taskError, shutdownError], 'Dot task and shutdown recording failed');
    }
    throw shutdownError;
  }

  if (taskError) {
    throw taskError;
  }

  return { agentId, result };
}