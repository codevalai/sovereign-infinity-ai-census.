import { randomUUID } from 'node:crypto';
import { getOpenAIClient } from '../openai_client.js';
import { registerAgentBirth, registerAgentShutdown } from '../agent_registry.js';
import { recordAgentTelemetry } from '../telemetry_client.js';

export async function runAstraSession(input: string): Promise<string | null> {
  const agentId = await registerAgentBirth({
    externalId: `astra-${randomUUID()}`,
    tierName: 'astra',
    details: { factory_source: 'session' },
  });

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: 'You are Astra, the front-door agent for the Sovereign Infinity census.',
        },
        { role: 'user', content: input },
      ],
    });
    await recordAgentTelemetry(agentId, 'tool_call', {
      model: 'gpt-4.1-mini',
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
    });
    return response.choices[0]?.message.content ?? null;
  } catch (error) {
    await recordAgentTelemetry(agentId, 'task_failed', { task_type: 'astra_session' });
    throw error;
  } finally {
    await registerAgentShutdown(agentId, { reason: 'session_complete' });
  }
}