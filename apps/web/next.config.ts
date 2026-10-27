import { resolve } from 'node:path'
import { loadEnvConfig } from '@next/env'
import type { NextConfig } from 'next'

// Env lives in the repo-root .env.local, shared with the agent.
loadEnvConfig(resolve(import.meta.dirname, '../..'))

const nextConfig: NextConfig = {
  transpilePackages: ['@jemma/profiling'],
}

export default nextConfig

import('@opennextjs/cloudflare').then((m) => m.initOpenNextCloudflareForDev())
