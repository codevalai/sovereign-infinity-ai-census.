import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const providedBytes = new Uint8Array(providedHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < providedBytes.length; index += 1) {
    difference |= providedBytes[index] ^ expectedBytes[index];
  }
  return difference === 0;
}

export async function authorize(
  request: Request,
  secretName = 'AGENT_LIFECYCLE_KEY',
): Promise<Response | null> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const expected = Deno.env.get(secretName);
  if (!expected || expected.length < 32) {
    return jsonResponse({ error: 'Agent endpoint is not configured' }, 503);
  }

  const [scheme, token, ...extraParts] = request.headers.get('authorization')?.split(' ') ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !token || extraParts.length > 0
    || !(await secretsMatch(token, expected))) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  return null;
}

export function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase service credentials are not configured');
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}