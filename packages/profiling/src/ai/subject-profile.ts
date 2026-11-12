import type { JemmaDb } from '../db'
import { maybe } from '../tools/context'

/**
 * What a job is told about the class it works for: its subject, its grade and the country of its school.
 *
 * The prompts were written for a South African Grade 6 Mathematics class, and a recorded demo answer is found by a hash of
 * the whole model call. So the class that those words are true of, the baseline, must stay exactly as it is: `prompt-variants.ts`
 * changes a prompt only for another class. The class is loaded in code, never through a model tool call.
 */

export type SubjectKey = 'mathematics' | 'english' | 'natural_sciences' | 'social_sciences' | 'technology' | 'life_skills' | 'other'

export type SubjectProfile = {
  key: SubjectKey
  /** The family keys to suggest for the topics of this subject, or null: short lowercase words of the model's own. */
  families: readonly string[] | null
  /** How an answer looks, in words a prompt can use. */
  answers: string
}

type Known = { key: Exclude<SubjectKey, 'other'>; names: string[]; profile: Omit<SubjectProfile, 'key'> }

/** Answers of every subject but Mathematics are marked in code too, so they have to be one value a computer can compare. */
const MARKABLE = 'a whole number, a decimal number or a choice letter (A to D)'

const KNOWN: Known[] = [
  {
    key: 'mathematics',
    names: ['mathematics', 'maths', 'math'],
    profile: { families: ['fractions', 'decimals', 'shape', 'measurement', 'data'], answers: 'a number, a fraction, a decimal, money or a choice letter' },
  },
  { key: 'english', names: ['english'], profile: { families: ['reading', 'writing', 'language', 'speaking_listening'], answers: MARKABLE } },
  {
    key: 'natural_sciences',
    names: ['natural sciences', 'natural science', 'science', 'sciences'],
    profile: { families: ['life_living', 'matter_materials', 'energy_change', 'earth_beyond'], answers: MARKABLE },
  },
  { key: 'social_sciences', names: ['social sciences', 'social science', 'social studies'], profile: { families: ['history', 'geography'], answers: MARKABLE } },
  { key: 'technology', names: ['technology'], profile: { families: ['structures', 'processing', 'mechanical_systems', 'electrical_systems'], answers: MARKABLE } },
  { key: 'life_skills', names: ['life skills', 'life orientation'], profile: { families: ['personal_wellbeing', 'physical_education', 'creative_arts'], answers: MARKABLE } },
]

const norm = (text: string) => text.toLowerCase().replace(/[^a-z]+/g, ' ').trim()

/** The profile of a subject, however it is written ("Maths", "natural science", "English Home Language"). */
export function subjectProfile(subject: string): SubjectProfile {
  const n = norm(subject ?? '')
  const hit = KNOWN.find((k) => k.names.includes(n) || (k.key === 'english' && n.startsWith('english')))
  return hit ? { key: hit.key, ...hit.profile } : { key: 'other', families: null, answers: MARKABLE }
}

const COUNTRIES: Record<string, string> = {
  ZA: 'South Africa', KE: 'Kenya', NG: 'Nigeria', GH: 'Ghana', UG: 'Uganda', TZ: 'Tanzania', ZM: 'Zambia', ZW: 'Zimbabwe', MW: 'Malawi',
  BW: 'Botswana', NA: 'Namibia', LS: 'Lesotho', SZ: 'Eswatini', MZ: 'Mozambique', RW: 'Rwanda', ET: 'Ethiopia', EG: 'Egypt', MA: 'Morocco',
  GB: 'United Kingdom', US: 'United States', IN: 'India', AU: 'Australia',
}

/** The two-letter code in capitals when the country is written as a code or as a name we know; else what was written. */
export function normalizeCountry(raw: string): string {
  const text = (raw ?? '').trim()
  if (!text) return ''
  if (/^[a-z]{2}$/i.test(text)) return text.toUpperCase()
  const named = Object.entries(COUNTRIES).find(([, name]) => name.toLowerCase() === text.toLowerCase())
  return named ? named[0] : text
}

/** The name of a country for a prompt: our short list, else the runtime's own region names, else the code as written. */
export function countryName(code: string): string {
  const c = normalizeCountry(code)
  if (!c) return 'unknown'
  if (COUNTRIES[c]) return COUNTRIES[c]!
  if (/^[A-Z]{2}$/.test(c)) {
    try {
      const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(c)
      if (name && name !== c) return name
    } catch {
      // keep the code
    }
  }
  return c
}

export type ClassContext = {
  classId: string
  /** The subject as the class has it written, for the line a prompt shows. */
  subject: string
  subjectKey: SubjectKey
  grade: number
  /** The two-letter code when it is one we know, else what the school has written. */
  country: string
  countryName: string
}

export function makeClassContext(input: { classId: string; subject: string; grade: number; country: string }): ClassContext {
  const country = normalizeCountry(input.country)
  return {
    classId: input.classId,
    subject: (input.subject ?? '').trim(),
    subjectKey: subjectProfile(input.subject).key,
    grade: input.grade,
    country,
    countryName: countryName(country),
  }
}

/**
 * True for Mathematics, Grade 6, South Africa (the class the prompts were written for), and for a class that could not be
 * told: a job then keeps its prompt as the file has it.
 */
export function isBaselineClass(c: ClassContext | null): boolean {
  return !c || (c.subjectKey === 'mathematics' && c.grade === 6 && c.country === 'ZA')
}

// ---- Which class the work belongs to ---------------------------------------------------------------------------------

/** What a job was given. The class is found from the first of these that names one; a child is placed last. */
export type ClassRef = {
  classId?: string | null
  mapId?: string | null
  testId?: string | null
  paperId?: string | null
  sessionId?: string | null
  eventId?: string | null
  childId?: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (v: string | null | undefined): v is string => typeof v === 'string' && UUID.test(v)

/** The classes a child is enrolled in. */
export async function childClassIds(db: JemmaDb, childId: string): Promise<string[]> {
  const { data, error } = await db.from('enrolments').select('class_id').eq('child_id', childId)
  if (error) throw new Error(error.message)
  return [...new Set((data ?? []).map((e) => e.class_id))]
}

/** The class a session's topic belongs to, through the topic's map. */
async function classOfSession(db: JemmaDb, sessionId: string): Promise<string | null> {
  const session = await maybe(db.from('sessions').select('topic_id').eq('id', sessionId).maybeSingle())
  if (!session?.topic_id) return null
  const topic = await maybe(db.from('topics').select('map_id').eq('id', session.topic_id).maybeSingle())
  if (!topic) return null
  const map = await maybe(db.from('curriculum_maps').select('class_id').eq('id', topic.map_id).maybeSingle())
  return map?.class_id ?? null
}

/** The class an event is about, from what its payload names (a map, a test, a paper or a session). A learner alone names none. */
async function classOfEvent(db: JemmaDb, eventId: string): Promise<string | null> {
  const event = await maybe(db.from('events').select('payload').eq('id', eventId).maybeSingle())
  const payload = event?.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const field = (key: string) => {
    const value = (payload as Record<string, unknown>)[key]
    return typeof value === 'string' ? value : null
  }
  return classIdFor(db, { mapId: field('mapId'), testId: field('testId'), paperId: field('paperId'), sessionId: field('sessionId') })
}

/**
 * The class the work belongs to, or null when it cannot be told. A class, a map, a test or a teacher's paper names it.
 * A learner's own paper (homework), a session and an event are placed through the child: when the child is in one class that
 * is the class, and when the child is in several, the class of the session's topic or of the event is used if the child is in it.
 */
export async function classIdFor(db: JemmaDb, ref: ClassRef): Promise<string | null> {
  if (isId(ref.classId)) return ref.classId
  if (isId(ref.mapId)) {
    const map = await maybe(db.from('curriculum_maps').select('class_id').eq('id', ref.mapId).maybeSingle())
    if (map) return map.class_id
  }
  if (isId(ref.testId)) {
    const test = await maybe(db.from('tests').select('class_id').eq('id', ref.testId).maybeSingle())
    if (test) return test.class_id
  }
  let childId = ref.childId
  if (isId(ref.paperId)) {
    const paper = await maybe(db.from('papers').select('test_id, child_id').eq('id', ref.paperId).maybeSingle())
    if (paper?.test_id) {
      const test = await maybe(db.from('tests').select('class_id').eq('id', paper.test_id).maybeSingle())
      if (test) return test.class_id
    }
    childId = childId ?? paper?.child_id
  }
  const fromSession = isId(ref.sessionId) ? await classOfSession(db, ref.sessionId) : null
  const fromEvent = isId(ref.eventId) ? await classOfEvent(db, ref.eventId) : null
  if (!isId(childId)) return fromSession ?? fromEvent
  const classes = await childClassIds(db, childId)
  if (fromSession && classes.includes(fromSession)) return fromSession
  if (fromEvent && classes.includes(fromEvent)) return fromEvent
  return classes.length === 1 ? classes[0]! : null
}

/** The class a Needs you item or a notification points at, from the id it holds: a paper, a test, a map, a class, an event or a session. */
export async function classIdOfRef(db: JemmaDb, refId: string | null | undefined): Promise<string | null> {
  if (!isId(refId)) return null
  for (const ref of [{ paperId: refId }, { testId: refId }, { mapId: refId }, { eventId: refId }, { sessionId: refId }] satisfies ClassRef[]) {
    const found = await classIdFor(db, ref)
    if (found) return found
  }
  // A file of past records a teacher brought in names the class it was brought in for.
  const imported = await maybe(db.from('record_imports').select('class_id').eq('id', refId).maybeSingle())
  if (imported) return imported.class_id
  const cls = await maybe(db.from('classes').select('id').eq('id', refId).maybeSingle())
  return cls?.id ?? null
}

/** The subject, grade and country of the class the work belongs to, or null when the class cannot be told. */
export async function classContext(db: JemmaDb, ref: ClassRef): Promise<ClassContext | null> {
  const classId = await classIdFor(db, ref)
  if (!classId) return null
  const cls = await maybe(db.from('classes').select('id, subject, grade, school_id').eq('id', classId).maybeSingle())
  if (!cls) return null
  const school = await maybe(db.from('schools').select('country').eq('id', cls.school_id).maybeSingle())
  return makeClassContext({ classId: cls.id, subject: cls.subject, grade: cls.grade, country: school?.country ?? '' })
}
