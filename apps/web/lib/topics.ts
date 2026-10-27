import type { SupabaseClient } from '@supabase/supabase-js'

export type TopicLabelled = { name: string; short_name?: string | null }

/** Boards with tight rows draw the short label; map and gap titles draw the full name. */
export function topicLabel(topic: TopicLabelled, kind: 'short' | 'long'): string {
  return kind === 'long' ? topic.name : (topic.short_name?.trim() || topic.name)
}

/**
 * Short label for a topic name, read from the topics the caller can see. Falls back to the name
 * itself, which is already short for most topics.
 */
export async function loadShortLabels(db: SupabaseClient): Promise<(name: string) => string> {
  const { data } = await db.from('topics').select('name, short_name').not('short_name', 'is', null)
  const byName = new Map((data ?? []).map((t: { name: string; short_name: string | null }) => [t.name, t.short_name as string]))
  return (name) => byName.get(name) ?? name
}
