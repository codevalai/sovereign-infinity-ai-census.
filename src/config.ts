import 'dotenv/config';

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function readSupabaseUrl(): string {
  const value = requiredEnvironmentVariable('SUPABASE_URL');
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('SUPABASE_URL must use HTTP or HTTPS');
  }
  return value;
}

function readPort(): number {
  const port = Number(process.env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function readCensusIngestionKey(): string {
  const value = requiredEnvironmentVariable('CENSUS_INGESTION_KEY');
  if (value.length < 32) {
    throw new Error('CENSUS_INGESTION_KEY must be at least 32 characters long');
  }
  return value;
}

function readCensusReadKey(): string | undefined {
  const value = process.env.CENSUS_READ_KEY?.trim();
  if (value && value.length < 32) {
    throw new Error('CENSUS_READ_KEY must be at least 32 characters long');
  }
  return value || undefined;
}

function readCensusValuationKey(): string | undefined {
  const value = process.env.CENSUS_VALUATION_KEY?.trim();
  if (value && value.length < 32) {
    throw new Error('CENSUS_VALUATION_KEY must be at least 32 characters long');
  }
  return value || undefined;
}

export const config = {
  port: readPort(),
  supabaseUrl: readSupabaseUrl(),
  supabaseServiceRoleKey: requiredEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY'),
  censusIngestionKey: readCensusIngestionKey(),
  censusReadKey: readCensusReadKey(),
  censusValuationKey: readCensusValuationKey(),
};