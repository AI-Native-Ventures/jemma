import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export type TopicLabelled = { name: string; short_name?: string | null }

/** Boards with tight rows draw the short label; map and gap titles draw the full name. */
export function topicLabel(topic: TopicLabelled, kind: 'short' | 'long'): string {
  return kind === 'long' ? topic.name : (topic.short_name?.trim() || topic.name)
}

type ShortLabelRow = { name: string; short_name: string | null }

const labelsFrom = (rows: ShortLabelRow[] | null): ((name: string) => string) => {
  const byName = new Map((rows ?? []).map((t) => [t.name, t.short_name as string]))
  return (name) => byName.get(name) ?? name
}

/** The map ids of these classes. Ids only, read with the service client: a learner or a parent cannot read `curriculum_maps`. */
async function mapIdsOf(classIds: string[]): Promise<string[]> {
  if (classIds.length === 0) return []
  try {
    const { data } = await createSupabaseAdmin().from('curriculum_maps').select('id').in('class_id', classIds)
    return (data ?? []).map((m: { id: string }) => m.id)
  } catch {
    // No lookup, no short labels: the screen shows the names as they are.
    return []
  }
}

/**
 * Short label for a topic name, read from the topics the caller can see. Falls back to the name itself, which is already short for most topics.
 *
 * With a `scope`, only the topics of the maps of those classes are read (the caller has already shown it may see those classes). The read
 * still goes through the CALLER'S client, so row level security still decides what the caller sees, but it checks only those rows and not
 * every topic of every school. No class, or classes with no map: no topics are read at all, and every name is answered as it is.
 * Without a `scope`, every topic the caller can see is read (the old behaviour, kept for a caller that has no class to give).
 */
export async function loadShortLabels(db: SupabaseClient, scope?: { classIds: string[] }): Promise<(name: string) => string> {
  if (!scope) {
    const { data } = await db.from('topics').select('name, short_name').not('short_name', 'is', null)
    return labelsFrom(data)
  }
  const mapIds = await mapIdsOf([...new Set(scope.classIds)])
  if (mapIds.length === 0) return labelsFrom(null)
  const { data } = await db.from('topics').select('name, short_name').in('map_id', mapIds).not('short_name', 'is', null)
  return labelsFrom(data)
}

/**
 * The classes a learner is in (each once), read with the CALLER'S client: a learner and a parent can read the enrolments of a child they may
 * see, so a child the caller cannot see has no class here. For a loader that is not given a class (a learner's home, a parent's screen).
 */
export async function classIdsOfChild(db: SupabaseClient, childId: string): Promise<string[]> {
  const { data } = await db.from('enrolments').select('class_id').eq('child_id', childId)
  return [...new Set((data ?? []).map((e: { class_id: string }) => e.class_id))]
}
