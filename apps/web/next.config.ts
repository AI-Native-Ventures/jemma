import { resolve } from 'node:path'
import { loadEnvConfig } from '@next/env'
import type { NextConfig } from 'next'

// Env lives in the repo-root .env.local, shared with the agent.
loadEnvConfig(resolve(import.meta.dirname, '../..'))

/** A curriculum upload may carry up to three documents of 10 MB each (MAX_UPLOAD_BYTES in curriculum/upload-checks.ts), plus form overhead. */
const UPLOAD_BODY_LIMIT = '32mb'

const nextConfig: NextConfig = {
  transpilePackages: ['@jemma/profiling'],
  experimental: {
    // The default is 1 MB: a PDF over that is refused by the framework with no message a teacher can read. The proxy buffers
    // request bodies too (and cuts them at 10 MB), so both limits move together.
    serverActions: { bodySizeLimit: UPLOAD_BODY_LIMIT },
    proxyClientMaxBodySize: UPLOAD_BODY_LIMIT,
  },
  // The browser reads the same Supabase settings as the server (anon key only, never the service role).
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
}

export default nextConfig

import('@opennextjs/cloudflare').then((m) => m.initOpenNextCloudflareForDev())
