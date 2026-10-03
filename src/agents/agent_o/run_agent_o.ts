import { runAgentO } from './agent_o_orchestrator.js';

try {
  const results = await runAgentO();
  console.info(JSON.stringify({ spawned: results.length, agentIds: results.map(({ agentId }) => agentId) }));
} catch (error) {
  console.error('Agent-O run failed', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
}