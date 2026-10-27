import type { SupabaseClient } from '@supabase/supabase-js'

export interface ReplayStore {
  get(key: string): Promise<unknown | null>
  put(key: string, model: string, value: unknown): Promise<void>
}

export class ReplayMissError extends Error {
  constructor(readonly key: string) {
    super(`Replay miss: ${key}`)
    this.name = 'ReplayMissError'
  }
}

export class MemoryStore implements ReplayStore {
  private rows = new Map<string, unknown>()

  async get(key: string) {
    return this.rows.has(key) ? this.rows.get(key) : null
  }

  async put(key: string, _model: string, value: unknown) {
    this.rows.set(key, value)
  }
}

export class SupabaseReplayStore implements ReplayStore {
  constructor(private client: SupabaseClient) {}

  async get(key: string) {
    const { data, error } = await this.client
      .from('ai_replays')
      .select('response')
      .eq('key', key)
      .maybeSingle()
    if (error) throw new Error(`ai_replays read failed: ${error.message}`)
    return data ? (data.response as unknown) : null
  }

  async put(key: string, model: string, value: unknown) {
    const { error } = await this.client.from('ai_replays').upsert({ key, model, response: value })
    if (error) throw new Error(`ai_replays write failed: ${error.message}`)
  }
}
