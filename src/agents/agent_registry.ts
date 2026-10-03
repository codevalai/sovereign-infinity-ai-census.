import type { Json } from '../database.types.js';
import { supabase } from '../supabase.js';

interface BirthOptions {
  externalId: string;
  tierName: string;
  details?: Record<string, Json>;
  occurredAt?: string;
}

export async function registerAgentBirth(options: BirthOptions): Promise<string> {
  const [regionResult, tierResult] = await Promise.all([
    supabase.from('regions').select('id').eq('code', 'global').single(),
    supabase.from('agent_tiers').select('id').eq('name', options.tierName).single(),
  ]);

  if (regionResult.error || tierResult.error) {
    throw new Error('Agent registry is not provisioned for the requested region and tier');
  }

  const { data, error } = await supabase.rpc('register_agent_birth', {
    p_external_id: options.externalId,
    p_region_id: regionResult.data.id,
    p_tier_id: tierResult.data.id,
    p_occurred_at: options.occurredAt ?? new Date().toISOString(),
    p_details: options.details ?? {},
  });

  if (error || !data) {
    throw new Error('Agent birth could not be recorded');
  }

  return data;
}

export async function registerAgentShutdown(
  agentId: string,
  details: Record<string, Json> = {},
): Promise<void> {
  const { error } = await supabase.rpc('register_agent_shutdown', {
    p_agent_id: agentId,
    p_occurred_at: new Date().toISOString(),
    p_details: details,
  });

  if (error) {
    throw new Error('Agent shutdown could not be recorded');
  }
}