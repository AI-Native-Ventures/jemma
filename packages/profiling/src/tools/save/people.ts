import type { ToolContext } from '../context'
import { ok } from '../context'

/** The teacher of the child's class: the author of notes and activities saved without a signed-in user. */
export async function defaultAuthor(ctx: ToolContext, childId: string, prefer: 'teacher' | 'parent'): Promise<string> {
  if (prefer === 'parent') {
    const links = await ok(ctx.db.from('parent_links').select('parent_id').eq('child_id', childId).eq('status', 'approved').limit(1))
    if (links[0]) return links[0].parent_id
  }
  const enrolments = await ok(ctx.db.from('enrolments').select('class_id').eq('child_id', childId))
  if (enrolments.length) {
    const classes = await ok(ctx.db.from('classes').select('teacher_id').in('id', enrolments.map((e) => e.class_id)).order('created_at').limit(1))
    if (classes[0]) return classes[0].teacher_id
  }
  throw new Error('no teacher or parent found to attribute this to')
}
