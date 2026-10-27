import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@jemma/profiling/db'

/** Supabase client for client components. Env comes from next.config env mapping. */
export function createSupabaseBrowser() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
