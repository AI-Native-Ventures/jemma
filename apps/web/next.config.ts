import { resolve } from 'node:path'
import { loadEnvConfig } from '@next/env'
import type { NextConfig } from 'next'

// Env lives in the repo-root .env.local, shared with the agent.
loadEnvConfig(resolve(import.meta.dirname, '../..'))

const nextConfig: NextConfig = {
  transpilePackages: ['@jemma/profiling'],
  // "Add past records" sends a file of up to 1 MB to a server action as text. The default limit for an action's body is 1 MB.
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  // The browser reads the same Supabase settings as the server (anon key only, never the service role).
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
}

export default nextConfig

import('@opennextjs/cloudflare').then((m) => m.initOpenNextCloudflareForDev())
