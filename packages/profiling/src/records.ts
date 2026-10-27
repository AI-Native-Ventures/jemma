import { z } from 'zod'
import type { JemmaDb } from './db'

const Uuid = z.string().uuid()
const ObsKind = z.enum(['participation', 'confidence', 'effort', 'behaviour'])
const ActKind = z.enum(['sport', 'club', 'music', 'art', 'other'])
const AttStatus = z.enum(['here', 'late', 'away'])

async function one(q: PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>, what: string) {
  const { data, error } = await q
  if (error || !data) throw new Error(`${what} failed: ${error?.message ?? 'no row'}`)
  return data.id
}

const ObservationInput = z.object({ childId: Uuid, authorId: Uuid, kind: ObsKind, text: z.string().trim().min(1).max(2000) })
export async function insertObservation(db: JemmaDb, input: z.input<typeof ObservationInput>): Promise<string> {
  const v = ObservationInput.parse(input)
  return one(db.from('observations').insert({ child_id: v.childId, author_id: v.authorId, kind: v.kind, text: v.text }).select('id').single(), 'insertObservation')
}

const AttendanceInput = z.object({
  classId: Uuid,
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.array(z.object({ childId: Uuid, status: AttStatus })).min(1),
})
/** Upserts one row per child for the day. Returns how many rows were saved. */
export async function saveAttendance(db: JemmaDb, input: z.input<typeof AttendanceInput>): Promise<number> {
  const v = AttendanceInput.parse(input)
  const enrolled = await db.from('enrolments').select('child_id').eq('class_id', v.classId)
  if (enrolled.error) throw new Error(`saveAttendance failed: ${enrolled.error.message}`)
  const inClass = new Set(enrolled.data.map((e) => e.child_id))
  const stray = v.entries.filter((e) => !inClass.has(e.childId))
  if (stray.length) throw new Error('saveAttendance failed: a child is not in this class')
  const { error } = await db
    .from('attendance')
    .upsert(v.entries.map((e) => ({ child_id: e.childId, day: v.day, status: e.status })), { onConflict: 'child_id,day' })
  if (error) throw new Error(`saveAttendance failed: ${error.message}`)
  return v.entries.length
}

const ActivityInput = z.object({
  childId: Uuid,
  createdBy: Uuid,
  kind: ActKind,
  name: z.string().trim().min(1).max(200),
  place: z.string().trim().max(200).nullish(),
  days: z.array(z.string()),
  since: z.string().trim().min(1),
})
export async function insertActivity(db: JemmaDb, input: z.input<typeof ActivityInput>): Promise<string> {
  const v = ActivityInput.parse(input)
  return one(
    db.from('activities').insert({ child_id: v.childId, created_by: v.createdBy, kind: v.kind, name: v.name, place: v.place ?? null, days: v.days, since: v.since }).select('id').single(),
    'insertActivity',
  )
}
