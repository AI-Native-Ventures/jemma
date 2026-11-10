import type { JemmaDb } from '../../packages/profiling/src/db'

/** Small lookups inside one sandbox. Each throws a plain message when the seed did not make the row. */

export async function childIdOf(admin: JemmaDb, schoolId: string, firstName: string): Promise<string> {
  const { data, error } = await admin.from('children').select('id').eq('school_id', schoolId).eq('first_name', firstName).limit(1)
  if (error) throw new Error(`could not look up ${firstName}: ${error.message}`)
  const id = data?.[0]?.id
  if (!id) throw new Error(`the sandbox has no learner called ${firstName}`)
  return id
}

export async function testOf(admin: JemmaDb, classId: string): Promise<{ id: string; outOf: number }> {
  const { data, error } = await admin.from('tests').select('id, out_of').eq('class_id', classId).limit(1)
  if (error) throw new Error(`could not look up the test: ${error.message}`)
  const row = data?.[0]
  if (!row) throw new Error('the sandbox has no test (is the stage marked?)')
  return { id: row.id, outOf: row.out_of }
}

export async function paperOf(admin: JemmaDb, testId: string, childId: string): Promise<string> {
  const { data, error } = await admin.from('papers').select('id').eq('test_id', testId).eq('child_id', childId).limit(1)
  if (error) throw new Error(`could not look up the paper: ${error.message}`)
  const id = data?.[0]?.id
  if (!id) throw new Error('the learner has no paper on this test')
  return id
}

export async function reteachRow(admin: JemmaDb, testId: string) {
  const { data, error } = await admin.from('reteach_plans').select('id, class_id, test_id, topic_name, content, why, missing_basic, explanation').eq('test_id', testId)
  if (error) throw new Error(`could not read reteach plans: ${error.message}`)
  return data ?? []
}
