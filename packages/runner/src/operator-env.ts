import type { AgentName } from './agents'

/**
 * The environment names the operator script removes before it starts an agent. The agent CLI inherits this process's
 * environment: it must see no Supabase name and no secret, and for Claude Code and Codex it must see no provider key,
 * because a provider key would be billed instead of the signed-in subscription.
 */
export const OPERATOR_SCRUBBED_KEYS: readonly string[] = [
  'SUPABASE_PROJECT_ID', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DB_URL',
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'EVENTS_SECRET', 'CHILD_PIN_PEPPER', 'JEMMA_MCP_TOKEN',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY',
  'OPENROUTER_API_KEY', 'DEEPSEEK_API_KEY', 'OPENCODE_API_KEY', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_BEARER_TOKEN_BEDROCK', 'GOOGLE_APPLICATION_CREDENTIALS',
]

/** The names to remove for one engine. Goose is the one engine that needs its OpenRouter key, so that name stays off the list. */
export function operatorScrubKeys(agent: AgentName): string[] {
  return agent === 'goose' ? OPERATOR_SCRUBBED_KEYS.filter((key) => key !== 'OPENROUTER_API_KEY') : [...OPERATOR_SCRUBBED_KEYS]
}

/**
 * Cleans the process environment for the agent that is about to start. `env` is the repo `.env.local` merged with the
 * environment (what the script reads its settings from), `processEnv` is what the agent will inherit.
 * Goose gets its OpenRouter key from `env`, because the key may be only in `.env.local` and goose reads the process
 * environment. Without a key it throws. For Claude Code and Codex the key is gone afterwards.
 */
export function prepareOperatorEnv(env: Record<string, string | undefined>, processEnv: NodeJS.ProcessEnv, agent: AgentName): void {
  for (const key of operatorScrubKeys(agent)) delete processEnv[key]
  if (agent !== 'goose') return
  const key = env.OPENROUTER_API_KEY
  if (!key || !key.trim()) throw new Error('set OPENROUTER_API_KEY in .env.local: goose needs a (free) OpenRouter key')
  processEnv.OPENROUTER_API_KEY = key
}
