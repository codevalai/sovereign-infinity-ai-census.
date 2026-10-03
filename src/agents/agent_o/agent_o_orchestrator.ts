import { randomUUID } from 'node:crypto';
import { registerAgentBirth, registerAgentShutdown } from '../agent_registry.js';
import { spawnDot } from '../dots/dot_spawner.js';
import { getTelemetrySnapshot, recordAgentTelemetry } from '../telemetry_client.js';

const maxDotsPerRun = 5;

export async function runAgentO(): Promise<Array<{ agentId: string; result: string | null }>> {
  const agentId = await registerAgentBirth({
    externalId: `agent-o-${randomUUID()}`,
    tierName: 'agent_o',
    details: { factory_source: 'scheduler' },
  });

  try {
    const snapshot = await getTelemetrySnapshot();
    const dotCount = Math.min(Math.floor(snapshot.pendingTasks / 1000), maxDotsPerRun);
    const results: Array<{ agentId: string; result: string | null }> = [];

    for (let index = 0; index < dotCount; index += 1) {
      results.push(await spawnDot({
        taskType: 'micro_eval',
        prompt: 'Perform one concise micro-evaluation for the Sovereign Infinity census.',
        parentAgentId: agentId,
      }));
    }

    await recordAgentTelemetry(agentId, 'orchestration', {
      pending_tasks: snapshot.pendingTasks,
      dots_spawned: results.length,
    });
    return results;
  } finally {
    await registerAgentShutdown(agentId, { reason: 'orchestration_complete' });
  }
}