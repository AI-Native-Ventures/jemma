import { createServiceClient, type JemmaDb } from '@jemma/profiling/db'

/** Service role client. Server only: it bypasses RLS, so use it for auth bookkeeping, never to read screen data. */
export function createSupabaseAdmin(): JemmaDb {
  return createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  })
}
