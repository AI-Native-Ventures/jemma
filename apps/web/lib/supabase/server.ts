import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@jemma/profiling/db'
import { supabaseEnv } from './env'

/** Supabase client for server components and actions. Reads and writes the session cookies; runs under RLS. */
export async function createSupabaseServer() {
  const store = await cookies()
  const { url, anonKey } = supabaseEnv()
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options)
        } catch {
          // Called from a server component: cookies are read-only there. proxy.ts refreshes the session.
        }
      },
    },
  })
}
