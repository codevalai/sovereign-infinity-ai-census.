import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import type { Database } from './database.types.js';

export const supabase = createClient<Database>(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);