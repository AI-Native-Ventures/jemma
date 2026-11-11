import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient, type JemmaDb } from '../../packages/profiling/src/db'
import {
  canCopyFrom,
  ClassWriteError,
  createClassRecord,
  createSchoolForTeacher,
  addNewLearner,
  enrolExistingLearner,
  findLearnersAtSchool,
  makeSignInCode,
  newJoinCode,
} from '../../apps/web/lib/class-writes'
import { childEmail, childPassword } from '../../apps/web/lib/child-login'

// "Any class, any school" on real rows: a class in any grade and subject, learners copied or enrolled without a second child row,
// a school that is not in the list, and a learner's sign-in code made by the teacher. Small schools made for this file; no agent,
// no model.

const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createServiceClient({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey })
const PASSWORD = 'any-class-Passw0rd!'
const tag = `anyc${Date.now()}`

const userIds: string[] = []
const schoolIds: string[] = []
const ids: Record<string, string> = {}

async function ok<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data
}

async function mkUser(key: string, role: 'teacher' | 'parent', schoolId: string | null, name: string) {
  const { data, error } = await service.auth.admin.createUser({ email: `${tag}-${key}@example.test`, password: PASSWORD, email_confirm: true })
  if (error) throw error
  await ok(service.from('profiles').insert({ user_id: data.user.id, role, display_name: name, school_id: schoolId }))
  userIds.push(data.user.id)
  ids[key] = data.user.id
  return data.user.id
}

async function signedIn(key: string): Promise<JemmaDb> {
  const client = createClient(url, anonKey, opts) as unknown as JemmaDb
  const s = await client.auth.signInWithPassword({ email: `${tag}-${key}@example.test`, password: PASSWORD })
  if (s.error) throw s.error
  return client
}

const childCount = async (schoolId: string) => (await ok(service.from('children').select('id').eq('school_id', schoolId))).length
const classIn = async (classId: string) => (await ok(service.from('enrolments').select('child_id').eq('class_id', classId))).map((e) => e.child_id).sort()
const mkClass = (schoolId: string, teacherId: string, name: string, grade: number, subject: string) =>
  createClassRecord(service, { userId: teacherId, schoolId, name, grade, subject, code: newJoinCode(), learners: [] })

beforeAll(async () => {
  const [sA] = await ok(service.from('schools').insert({ name: `${tag} School A`, country: 'ZA' }).select('id'))
  const [sB] = await ok(service.from('schools').insert({ name: `${tag} School B`, country: 'ZA' }).select('id'))
  schoolIds.push(sA!.id, sB!.id)
  ids.sA = sA!.id
  ids.sB = sB!.id
  await mkUser('teacher', 'teacher', sA!.id, 'Ms Banda')
  await mkUser('colleague', 'teacher', sA!.id, 'Mr Dube')
  await mkUser('other', 'teacher', sB!.id, 'Mr Other')
  await mkUser('parent', 'parent', null, 'Thandi M')
  const six = await mkClass(sA!.id, ids.teacher!, '6B Mathematics', 6, 'Mathematics')
  const sixOther = await mkClass(sB!.id, ids.other!, '6C Mathematics', 6, 'Mathematics')
  ids.sixB = six.classId
  ids.sixC = sixOther.classId
  const kids = await ok(
    service
      .from('children')
      .insert([
        { school_id: sA!.id, first_name: 'Amina', grade: 6 },
        { school_id: sA!.id, first_name: 'Thabo', grade: 6 },
        { school_id: sA!.id, first_name: 'Amina', grade: 7 },
        { school_id: sB!.id, first_name: 'Amina', grade: 6 },
        { school_id: sA!.id, first_name: '50%_off', grade: 6 },
      ])
      .select('id, first_name, grade, school_id'),
  )
  const find = (n: string, g: number, s: string) => kids.find((k) => k.first_name === n && k.grade === g && k.school_id === s)!.id
  ids.amina6 = find('Amina', 6, sA!.id)
  ids.thabo = find('Thabo', 6, sA!.id)
  ids.amina7 = find('Amina', 7, sA!.id)
  ids.aminaB = find('Amina', 6, sB!.id)
  ids.percent = find('50%_off', 6, sA!.id)
  await ok(service.from('enrolments').insert([
    { class_id: ids.sixB!, child_id: ids.amina6! },
    { class_id: ids.sixB!, child_id: ids.thabo! },
    { class_id: ids.sixB!, child_id: ids.percent! },
    { class_id: ids.sixC!, child_id: ids.aminaB! },
  ]))
}, 120_000)

afterAll(async () => {
  for (const id of schoolIds) await service.from('schools').delete().eq('id', id)
  // Schools made through the form are found by name, as nothing else ties them to this file.
  const made = await service.from('schools').select('id').like('name', `${tag}%`)
  for (const s of made.data ?? []) await service.from('schools').delete().eq('id', s.id)
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  const logins = await service.from('child_logins').select('user_id').in('child_id', Object.values(ids).filter((v) => uuid.test(v)))
  for (const l of logins.data ?? []) await service.auth.admin.deleteUser(l.user_id)
  for (const id of userIds) await service.auth.admin.deleteUser(id)
}, 120_000)

describe('a class in any grade and subject', () => {
  test('stores the grade and the subject it was given, with the teacher and the school', async () => {
    const made = await createClassRecord(service, {
      userId: ids.teacher!, schoolId: ids.sA!, name: '9A Natural Sciences', grade: 9, subject: 'Natural Sciences', code: newJoinCode(), learners: [],
    })
    const row = await ok(service.from('classes').select('name, grade, subject, school_id, teacher_id').eq('id', made.classId).single())
    expect(row).toEqual({ name: '9A Natural Sciences', grade: 9, subject: 'Natural Sciences', school_id: ids.sA, teacher_id: ids.teacher })
    expect(made).toMatchObject({ added: 0, copied: 0 })
    ids.nine = made.classId
  })

  test('new learners become children of the school with the class grade, and are enrolled', async () => {
    const before = await childCount(ids.sA!)
    const made = await createClassRecord(service, {
      userId: ids.teacher!, schoolId: ids.sA!, name: '2A Life Skills', grade: 2, subject: 'Life Skills', code: newJoinCode(), learners: ['Zola', ' Zola ', 'Yusuf', ''],
    })
    expect(made).toMatchObject({ added: 2, copied: 0 })
    expect(await childCount(ids.sA!)).toBe(before + 2)
    const kids = await ok(service.from('children').select('first_name, grade').in('id', await classIn(made.classId)))
    expect(kids.map((k) => `${k.first_name}:${k.grade}`).sort()).toEqual(['Yusuf:2', 'Zola:2'])
  })

  test('a taken or bad code is replaced and the class is still made', async () => {
    const sixCode = (await ok(service.from('classes').select('join_code').eq('id', ids.sixB!).single())).join_code
    const made = await createClassRecord(service, { userId: ids.teacher!, schoolId: ids.sA!, name: '8A English', grade: 8, subject: 'English', code: sixCode, learners: [] })
    const code = (await ok(service.from('classes').select('join_code').eq('id', made.classId).single())).join_code
    expect(code).not.toBe(sixCode)
    const bad = await createClassRecord(service, { userId: ids.teacher!, schoolId: ids.sA!, name: '8B English', grade: 8, subject: 'English', code: 'no', learners: [] })
    expect((await ok(service.from('classes').select('join_code').eq('id', bad.classId).single())).join_code).toMatch(/^[A-Z2-9]{6}$/)
  })
})

describe('copying the learners of another class', () => {
  test('enrols every learner of the source class in the new one and makes no child row', async () => {
    const before = await childCount(ids.sA!)
    const made = await createClassRecord(service, {
      userId: ids.teacher!, schoolId: ids.sA!, name: '6B English', grade: 6, subject: 'English', code: newJoinCode(), learners: [], copyFromClassId: ids.sixB,
    })
    expect(made).toMatchObject({ added: 0, copied: 3 })
    expect(await classIn(made.classId)).toEqual(await classIn(ids.sixB!))
    expect(await childCount(ids.sA!)).toBe(before)
    ids.sixBEnglish = made.classId
  })

  test('copied learners and a new learner can come together, and the source class is not changed', async () => {
    const before = await childCount(ids.sA!)
    const sourceBefore = await classIn(ids.sixB!)
    const made = await createClassRecord(service, {
      userId: ids.teacher!, schoolId: ids.sA!, name: '6B Science', grade: 6, subject: 'Natural Sciences', code: newJoinCode(), learners: ['Naledi'], copyFromClassId: ids.sixB,
    })
    expect(made).toMatchObject({ added: 1, copied: 3 })
    expect((await classIn(made.classId)).length).toBe(4)
    expect(await childCount(ids.sA!)).toBe(before + 1)
    expect(await classIn(ids.sixB!)).toEqual(sourceBefore)
  })

  test('a class of another school is refused and nothing is made', async () => {
    const classesBefore = (await ok(service.from('classes').select('id').eq('school_id', ids.sA!))).length
    await expect(
      createClassRecord(service, { userId: ids.teacher!, schoolId: ids.sA!, name: '6X Stolen', grade: 6, subject: 'English', code: newJoinCode(), learners: [], copyFromClassId: ids.sixC }),
    ).rejects.toThrow(ClassWriteError)
    expect((await ok(service.from('classes').select('id').eq('school_id', ids.sA!))).length).toBe(classesBefore)
  })

  test('the teacher may copy from a class they can see at their school, and from no other', async () => {
    const teacher = await signedIn('teacher')
    expect(await canCopyFrom(teacher, ids.sA!, ids.sixB!)).toBe(true)
    expect(await canCopyFrom(teacher, ids.sA!, ids.sixC!)).toBe(false)
    expect(await canCopyFrom(teacher, ids.sB!, ids.sixB!)).toBe(false)
  })
})

describe('a learner who is already at the school', () => {
  test('lists children of the same school with that first name, with grade and classes, and not ones from another school', async () => {
    const english = ids.sixBEnglish!
    await ok(service.from('enrolments').delete().eq('class_id', english).eq('child_id', ids.amina6!))
    const found = await findLearnersAtSchool(service, { classId: english, firstName: 'amina' })
    expect(found.map((f) => f.childId).sort()).toEqual([ids.amina6!, ids.amina7!].sort())
    const six = found.find((f) => f.childId === ids.amina6)!
    expect(six).toMatchObject({ firstName: 'Amina', grade: 6 })
    expect(six.classes).toContain('6B Mathematics')
    expect(found.find((f) => f.childId === ids.amina7)!.classes).toEqual([])
    expect(found.map((f) => f.childId)).not.toContain(ids.aminaB)
  })

  test('a child who is in the class already is not listed, and a name with % in it is matched as text', async () => {
    const found = await findLearnersAtSchool(service, { classId: ids.sixB!, firstName: 'Amina' })
    expect(found.map((f) => f.childId)).toEqual([ids.amina7])
    expect(await findLearnersAtSchool(service, { classId: ids.sixB!, firstName: '%' })).toEqual([])
    expect((await findLearnersAtSchool(service, { classId: ids.nine!, firstName: '50%_off' })).map((f) => f.childId)).toEqual([ids.percent])
    expect(await findLearnersAtSchool(service, { classId: ids.sixB!, firstName: '  ' })).toEqual([])
  })

  test('picking one adds an enrolment and no child row; picking again changes nothing', async () => {
    const before = await childCount(ids.sA!)
    const first = await enrolExistingLearner(service, { classId: ids.sixBEnglish!, childId: ids.amina6! })
    expect(first).toEqual({ ok: true, alreadyIn: false })
    expect(await childCount(ids.sA!)).toBe(before)
    expect(await classIn(ids.sixBEnglish!)).toContain(ids.amina6)
    expect(await enrolExistingLearner(service, { classId: ids.sixBEnglish!, childId: ids.amina6! })).toEqual({ ok: true, alreadyIn: true })
    expect((await ok(service.from('enrolments').select('child_id').eq('class_id', ids.sixBEnglish!).eq('child_id', ids.amina6!))).length).toBe(1)
  })

  test('a child of another school is refused and not enrolled', async () => {
    const answer = await enrolExistingLearner(service, { classId: ids.sixBEnglish!, childId: ids.aminaB! })
    expect(answer).toEqual({ ok: false, error: 'That learner is at another school' })
    expect(await classIn(ids.sixBEnglish!)).not.toContain(ids.aminaB)
    expect(await enrolExistingLearner(service, { classId: ids.sixBEnglish!, childId: '00000000-0000-4000-8000-000000000000' })).toEqual({ ok: false, error: 'That learner was not found' })
  })
})

describe('a school that is not in the list', () => {
  test('makes the school once, with no sandbox, and links the teacher to it', async () => {
    const t = await mkUser('fresh', 'teacher', null, 'Ms Nkosi')
    const name = `${tag} Kibera Primary`
    const made = await createSchoolForTeacher(service, { userId: t, name: `  ${name} `, country: 'KE', region: 'Nairobi' })
    expect(made.ok).toBe(true)
    if (!made.ok) return
    const school = await ok(service.from('schools').select('name, country, region, sandbox_id').eq('id', made.schoolId).single())
    expect(school).toEqual({ name, country: 'KE', region: 'Nairobi', sandbox_id: null })
    expect((await ok(service.from('profiles').select('school_id').eq('user_id', t).single())).school_id).toBe(made.schoolId)
    // The hourly demo sweep takes school ids only from demo_sandboxes rows: this school has none, so it can never be removed by it.
    expect((await ok(service.from('demo_sandboxes').select('id').eq('school_id', made.schoolId))).length).toBe(0)
    ids.kibera = made.schoolId
  })

  test('the same teacher gets no second school through the form', async () => {
    const again = await createSchoolForTeacher(service, { userId: ids.fresh!, name: `${tag} Second School`, country: 'KE' })
    expect(again).toEqual({ ok: false, error: 'You already have a school. Pick it from the list.' })
    expect((await ok(service.from('schools').select('id').like('name', `${tag} Second%`))).length).toBe(0)
  })

  test('another teacher who types the same name and country is offered the school that exists', async () => {
    const t = await mkUser('second', 'teacher', null, 'Mr Otieno')
    const answer = await createSchoolForTeacher(service, { userId: t, name: `${tag} KIBERA PRIMARY`, country: 'KE' })
    expect(answer.ok).toBe(false)
    if (answer.ok) return
    expect(answer.existing).toEqual({ id: ids.kibera, name: `${tag} Kibera Primary`, region: 'Nairobi', country: 'KE' })
    expect((await ok(service.from('schools').select('id').ilike('name', `${tag} Kibera Primary`))).length).toBe(1)
    expect((await ok(service.from('profiles').select('school_id').eq('user_id', t).single())).school_id).toBeNull()
  })

  test('the same name in another country is a different school', async () => {
    const answer = await createSchoolForTeacher(service, { userId: ids.second!, name: `${tag} Kibera Primary`, country: 'UG' })
    expect(answer.ok).toBe(true)
    expect((await ok(service.from('schools').select('id').ilike('name', `${tag} Kibera Primary`))).length).toBe(2)
  })

  test('a demo school with the same name is not offered, and a bad form or a parent is refused', async () => {
    const [demo] = await ok(service.from('schools').insert({ name: `${tag} Demo Hill`, country: 'ZA', sandbox_id: `${tag}-sandbox` }).select('id'))
    schoolIds.push(demo!.id)
    const t = await mkUser('third', 'teacher', null, 'Ms Third')
    const answer = await createSchoolForTeacher(service, { userId: t, name: `${tag} Demo Hill`, country: 'ZA' })
    expect(answer.ok).toBe(true)
    expect(await createSchoolForTeacher(service, { userId: ids.parent!, name: `${tag} Parent School`, country: 'ZA' })).toEqual({ ok: false, error: 'Only a teacher can start a school' })
    expect(await createSchoolForTeacher(service, { userId: t, name: 'A', country: 'ZA' })).toEqual({ ok: false, error: 'Type the name of the school (2 to 80 letters)' })
    expect(await createSchoolForTeacher(service, { userId: t, name: 'Fine Name', country: 'FR' })).toEqual({ ok: false, error: 'Pick the country' })
  })
})

describe("a learner's sign-in code made by the teacher", () => {
  const trySignIn = async (code: string, pin: string) => {
    const client = createClient(url, anonKey, opts)
    const { error } = await client.auth.signInWithPassword({ email: childEmail(code), password: await childPassword(code, pin) })
    return !error
  }

  test('a teacher makes the code and PIN for a learner of the class, and the learner can sign in with them', async () => {
    const made = await makeSignInCode(service, { teacherId: ids.teacher!, classId: ids.sixB!, childId: ids.thabo!, pin: '4821' })
    expect(made.ok).toBe(true)
    if (!made.ok) return
    expect(made.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    const login = await ok(service.from('child_logins').select('child_id, pin_set_by').eq('code', made.code).single())
    expect(login).toEqual({ child_id: ids.thabo, pin_set_by: ids.teacher })
    expect(await trySignIn(made.code, '4821')).toBe(true)
    expect(await trySignIn(made.code, '1111')).toBe(false)
    ids.thaboCode = made.code
  })

  test('making it again stops the old code', async () => {
    const again = await makeSignInCode(service, { teacherId: ids.teacher!, classId: ids.sixB!, childId: ids.thabo!, pin: '9032' })
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.code).not.toBe(ids.thaboCode)
    expect(await trySignIn(again.code, '9032')).toBe(true)
    expect(await trySignIn(ids.thaboCode!, '4821')).toBe(false)
    expect((await ok(service.from('child_logins').select('code').eq('child_id', ids.thabo!))).map((l) => l.code)).toEqual([again.code])
  })

  test('works for a learner who was copied into a second class, from either class', async () => {
    const made = await makeSignInCode(service, { teacherId: ids.teacher!, classId: ids.sixBEnglish!, childId: ids.amina6!, pin: '2468' })
    expect(made.ok).toBe(true)
  })

  test('refuses a PIN that is not 4 digits, a class the teacher does not teach, and a learner who is not in the class', async () => {
    for (const pin of ['123', '12345', 'abcd', '12 4', '']) {
      expect(await makeSignInCode(service, { teacherId: ids.teacher!, classId: ids.sixB!, childId: ids.thabo!, pin })).toEqual({ ok: false, error: 'Use 4 digits.' })
    }
    expect(await makeSignInCode(service, { teacherId: ids.colleague!, classId: ids.sixB!, childId: ids.thabo!, pin: '1234' })).toEqual({ ok: false, error: 'You do not teach this class.' })
    expect(await makeSignInCode(service, { teacherId: ids.teacher!, classId: ids.sixB!, childId: ids.amina7!, pin: '1234' })).toEqual({ ok: false, error: 'That learner is not in this class.' })
    expect(await makeSignInCode(service, { teacherId: ids.other!, classId: ids.sixC!, childId: ids.thabo!, pin: '1234' })).toEqual({ ok: false, error: 'That learner is not in this class.' })
  })
})

describe('two learners with the same first name', () => {
  const lastNames = async (classId: string) =>
    (await ok(service.from('children').select('first_name, last_name').in('id', await classIn(classId)))).map((k) => `${k.first_name} ${k.last_name ?? '-'}`).sort()

  test('a new class keeps the surnames it was given', async () => {
    const made = await createClassRecord(service, {
      userId: ids.teacher!, schoolId: ids.sA!, name: '5A Twins', grade: 5, subject: 'English', code: newJoinCode(),
      learners: [{ firstName: 'Neo', lastName: 'Dlamini' }, { firstName: 'Neo', lastName: 'Nkosi' }, 'Kabelo'],
    })
    expect(made).toMatchObject({ added: 3 })
    expect(await lastNames(made.classId)).toEqual(['Kabelo -', 'Neo Dlamini', 'Neo Nkosi'])
  })

  test('one of two with the same first name may have no surname, and a plain name typed twice is still one learner', async () => {
    const made = await createClassRecord(service, {
      userId: ids.teacher!, schoolId: ids.sA!, name: '5B Twins', grade: 5, subject: 'English', code: newJoinCode(),
      learners: ['Neo', { firstName: 'Neo', lastName: 'Nkosi' }, 'Lwazi', 'Lwazi'],
    })
    expect(made).toMatchObject({ added: 3 })
    expect(await lastNames(made.classId)).toEqual(['Lwazi -', 'Neo -', 'Neo Nkosi'])
  })

  test('a new learner with the same first name as a copied learner needs a surname, and nothing is made without it', async () => {
    const classesBefore = (await ok(service.from('classes').select('id').eq('school_id', ids.sA!))).length
    await expect(
      createClassRecord(service, { userId: ids.teacher!, schoolId: ids.sA!, name: '6B Twins', grade: 6, subject: 'English', code: newJoinCode(), learners: ['Amina'], copyFromClassId: ids.sixB }),
    ).rejects.toThrow('Two learners are called Amina. Add a surname to one of them so parents can tell them apart.')
    expect((await ok(service.from('classes').select('id').eq('school_id', ids.sA!))).length).toBe(classesBefore)
    const made = await createClassRecord(service, {
      userId: ids.teacher!, schoolId: ids.sA!, name: '6B Twins', grade: 6, subject: 'English', code: newJoinCode(), learners: [{ firstName: 'Amina', lastName: 'Nkosi' }], copyFromClassId: ids.sixB,
    })
    expect(made).toMatchObject({ added: 1, copied: 3 })
  })

  test('adding a learner to a class: the same first name needs a surname for one of the two', async () => {
    const first = await addNewLearner(service, { classId: ids.nine!, firstName: 'Zed' })
    expect(first.ok).toBe(true)
    const again = await addNewLearner(service, { classId: ids.nine!, firstName: ' zed ' })
    expect(again).toEqual({ ok: false, error: 'Two learners are called Zed. Add a surname to one of them so parents can tell them apart.' })
    const withSurname = await addNewLearner(service, { classId: ids.nine!, firstName: 'Zed', lastName: ' Okafor ' })
    expect(withSurname.ok).toBe(true)
    if (!withSurname.ok) return
    const row = await ok(service.from('children').select('first_name, last_name, grade, school_id').eq('id', withSurname.childId).single())
    expect(row).toEqual({ first_name: 'Zed', last_name: 'Okafor', grade: 9, school_id: ids.sA })
    expect((await ok(service.from('enrolments').select('child_id').eq('class_id', ids.nine!).eq('child_id', withSurname.childId))).length).toBe(1)
    const third = await addNewLearner(service, { classId: ids.nine!, firstName: 'Zed', lastName: 'Okafor' })
    expect(third).toEqual({ ok: false, error: 'Two learners are called Zed Okafor. Change one of the names so parents can tell them apart.' })
    const fourth = await addNewLearner(service, { classId: ids.nine!, firstName: 'Zed', lastName: 'Bello' })
    expect(fourth.ok).toBe(true)
  })

  test('an empty name or a class that does not exist is refused', async () => {
    expect(await addNewLearner(service, { classId: ids.nine!, firstName: '  ' })).toEqual({ ok: false, error: 'Type the learner\'s first name' })
    expect(await addNewLearner(service, { classId: '00000000-0000-4000-8000-000000000000', firstName: 'Who' })).toEqual({ ok: false, error: 'That class was not found' })
  })
})
