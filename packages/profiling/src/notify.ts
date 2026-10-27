import type { JemmaDb } from './db'

export type Notification = { title: string; body: string; href: string }

/** Writes one notifications row per user. The web app shows them; the agent sends no email, SMS or WhatsApp. */
export async function notify(db: JemmaDb, userIds: string[], n: Notification): Promise<void> {
  const users = [...new Set(userIds)]
  if (users.length === 0) return
  const { error } = await db.from('notifications').insert(users.map((user_id) => ({ user_id, title: n.title, body: n.body, href: n.href })))
  if (error) throw new Error(`notifications write failed: ${error.message}`)
}

/** Tells the approved parents of a child that the next lesson is saved. Returns who was told. */
export async function notifyLessonReady(db: JemmaDb, childId: string): Promise<string[]> {
  const { data, error } = await db.from('parent_links').select('parent_id').eq('child_id', childId).eq('status', 'approved')
  if (error) throw new Error(error.message)
  const parents = [...new Set((data ?? []).map((l) => l.parent_id))]
  await notify(db, parents, { title: "Tonight's lesson is ready", body: 'A new Jemma lesson is waiting for tonight.', href: `/p/${childId}` })
  return parents
}
