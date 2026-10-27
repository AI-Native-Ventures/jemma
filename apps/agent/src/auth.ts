import { createServiceClient, type JemmaDb } from '@jemma/profiling/db'

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type TokenScope = { schoolId: string; schoolIds: string[] }

async function rows<T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Schools a user covers: their profile school, the school of every class they teach, the schools of their approved linked children. */
async function userSchools(db: JemmaDb, userId: string): Promise<string[]> {
  const [profile, classes, links] = await Promise.all([
    rows(db.from('profiles').select('school_id').eq('user_id', userId)),
    rows(db.from('classes').select('school_id').eq('teacher_id', userId)),
    rows(db.from('parent_links').select('child_id').eq('parent_id', userId).eq('status', 'approved')),
  ])
  const kids = links.length ? await rows(db.from('children').select('school_id').in('id', links.map((l) => l.child_id))) : []
  const ids = [...profile.map((p) => p.school_id), ...classes.map((c) => c.school_id), ...kids.map((k) => k.school_id)]
  return [...new Set(ids.filter((s): s is string => !!s))]
}

/** `Authorization: Bearer <token>` against `mcp_tokens` (sha256). Null when missing, unknown, or covering no school. */
export async function authenticate(
  request: Request,
  env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string },
): Promise<{ db: JemmaDb; scope: TokenScope } | null> {
  const header = request.headers.get('authorization') ?? ''
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim()
  if (!token) return null
  const db = createServiceClient(env)
  const hash = await sha256Hex(token)
  const { data } = await db.from('mcp_tokens').select('school_id, user_id').eq('token_hash', hash).maybeSingle()
  if (!data) return null
  const schoolIds = data.school_id ? [data.school_id] : data.user_id ? await userSchools(db, data.user_id) : []
  if (schoolIds.length === 0) return null
  return { db, scope: { schoolId: schoolIds[0]!, schoolIds } }
}
