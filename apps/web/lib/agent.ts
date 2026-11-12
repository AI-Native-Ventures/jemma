import { createServiceClient, type Json, type JemmaDb } from '@jemma/profiling/db'
import { EventSchema, type EventPayload, type EventType } from '@jemma/profiling/schemas'

function serviceDb(): JemmaDb {
  return createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL ?? '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  })
}

async function schoolOfClass(db: JemmaDb, classId: string): Promise<string> {
  const { data, error } = await db.from('classes').select('school_id').eq('id', classId).single()
  if (error) throw new Error(`sendEvent: ${error.message}`)
  return data.school_id
}

async function schoolOfChild(db: JemmaDb, childId: string): Promise<string> {
  const { data, error } = await db.from('children').select('school_id').eq('id', childId).single()
  if (error) throw new Error(`sendEvent: ${error.message}`)
  return data.school_id
}

/** The school an event belongs to, found from the record its payload names. */
async function schoolOf(db: JemmaDb, payload: Record<string, string>): Promise<string> {
  if (payload.childId) return schoolOfChild(db, payload.childId)
  if (payload.mapId) {
    const { data, error } = await db.from('curriculum_maps').select('class_id').eq('id', payload.mapId).single()
    if (error) throw new Error(`sendEvent: ${error.message}`)
    return schoolOfClass(db, data.class_id)
  }
  if (payload.testId) {
    const { data, error } = await db.from('tests').select('class_id').eq('id', payload.testId).single()
    if (error) throw new Error(`sendEvent: ${error.message}`)
    return schoolOfClass(db, data.class_id)
  }
  if (payload.paperId) {
    const { data, error } = await db.from('papers').select('test_id, child_id').eq('id', payload.paperId).single()
    if (error) throw new Error(`sendEvent: ${error.message}`)
    if (data.test_id) return schoolOf(db, { testId: data.test_id })
    if (data.child_id) return schoolOfChild(db, data.child_id)
  }
  if (payload.importId) {
    const { data, error } = await db.from('record_imports').select('school_id').eq('id', payload.importId).single()
    if (error) throw new Error(`sendEvent: ${error.message}`)
    return data.school_id
  }
  if (payload.sessionId) {
    const { data, error } = await db.from('sessions').select('child_id').eq('id', payload.sessionId).single()
    if (error) throw new Error(`sendEvent: ${error.message}`)
    return schoolOfChild(db, data.child_id)
  }
  throw new Error('sendEvent: payload names no record')
}

export async function post(eventId: string): Promise<void> {
  const url = process.env.AGENT_URL
  if (!url) throw new Error('AGENT_URL is not set')
  const res = await fetch(`${url.replace(/\/$/, '')}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-jemma-secret': process.env.EVENTS_SECRET ?? '' },
    body: JSON.stringify({ eventId }),
  })
  if (!res.ok) throw new Error(`agent /events answered ${res.status}`)
}

/** Records an event with the service client and hands it to the agent's queue. Returns the event id. */
export async function sendEvent<T extends EventType>(type: T, payload: EventPayload<T>): Promise<string> {
  EventSchema.parse({ ...payload, type })
  const db = serviceDb()
  const schoolId = await schoolOf(db, payload as Record<string, string>)
  const { data, error } = await db.from('events').insert({ school_id: schoolId, type, payload: payload as unknown as NonNullable<Json> }).select('id').single()
  if (error) throw new Error(`sendEvent: ${error.message}`)
  await post(data.id)
  return data.id
}

/** Re-queues a failed event and posts it to the agent again. */
export async function retryEvent(eventId: string): Promise<void> {
  const db = serviceDb()
  const { data, error } = await db
    .from('events')
    .update({ status: 'queued', error: null, finished_at: null })
    .eq('id', eventId)
    .eq('status', 'failed')
    .select('id')
  if (error) throw new Error(`retryEvent: ${error.message}`)
  if (data.length === 0) throw new Error('retryEvent: event is not failed')
  await post(eventId)
}
