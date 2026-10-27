import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

export type JemmaDb = SupabaseClient<Database>

export type DbEnv = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

/** Service role client. Server and agent only: it bypasses row level security. */
export function createServiceClient(env: DbEnv): JemmaDb {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('createServiceClient needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
