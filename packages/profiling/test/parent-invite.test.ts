import { describe, expect, test } from 'vitest'
import {
  BAD_CODE,
  cleanParentCode,
  currentParentCode,
  isParentCode,
  linkParentWithCode,
  makeParentCode,
  newParentCode,
  OLD_CODE,
  PARENT_CODE_ALPHABET,
  PARENT_CODE_DAYS,
  PARENT_CODE_LENGTH,
  parentCodeExpiry,
  ParentCodeError,
} from '../src/parent-invite'
import { memoryDb, type MemoryDb } from './helpers/memory-db'

// A parent links to a learner who signed up alone (P114): the learner makes a code, the parent types it. Tables are in memory (helpers/memory-db.ts):
// no database, no network.

const LEARNER_SCHOOL = '11111111-1111-4111-8111-111111111111'
const SCHOOL = '11111111-1111-4111-8111-111111111112'
const LEARNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_LEARNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02'
const SCHOOL_LEARNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03'
const PARENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SECOND_PARENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'
const TEACHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const KID = '33333333-3333-4333-8333-333333333333'
const OTHER_KID = '33333333-3333-4333-8333-333333333302'
const SCHOOL_KID = '33333333-3333-4333-8333-333333333303'
const TWIN = '33333333-3333-4333-8333-333333333304'
const KID_CAPS = '44444444-4444-4444-8444-444444444444'
const KID_OWN = '44444444-4444-4444-8444-444444444445'
const NOW = new Date('2026-11-16T10:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

type Row = Record<string, unknown>

function world(over: Record<string, Row[]> = {}): MemoryDb {
  return memoryDb({
    schools: [
      { id: LEARNER_SCHOOL, name: "Neo's own", country: 'ZA', kind: 'private' },
      { id: SCHOOL, name: 'Hillview Primary', country: 'ZA', kind: 'school' },
    ],
    profiles: [
      { user_id: LEARNER, role: 'learner', display_name: 'Neo' },
      { user_id: OTHER_LEARNER, role: 'learner', display_name: 'Zola' },
      { user_id: SCHOOL_LEARNER, role: 'learner', display_name: 'Amina' },
      { user_id: PARENT, role: 'parent', display_name: 'Palesa' },
      { user_id: SECOND_PARENT, role: 'parent', display_name: 'Sipho' },
      { user_id: TEACHER, role: 'teacher', display_name: 'Ms Banda' },
    ],
    children: [
      { id: KID, school_id: LEARNER_SCHOOL, first_name: 'Neo', last_name: null, grade: 5, user_id: LEARNER, private_of: null },
      { id: OTHER_KID, school_id: LEARNER_SCHOOL, first_name: 'Zola', last_name: null, grade: 6, user_id: OTHER_LEARNER, private_of: null },
      { id: SCHOOL_KID, school_id: SCHOOL, first_name: 'Amina', last_name: 'Dlamini', grade: 6, user_id: SCHOOL_LEARNER, private_of: null },
      { id: TWIN, school_id: LEARNER_SCHOOL, first_name: 'Amina', last_name: 'Dlamini', grade: 6, user_id: SCHOOL_LEARNER, private_of: SCHOOL_KID },
    ],
    classes: [
      { id: KID_OWN, school_id: LEARNER_SCHOOL, teacher_id: LEARNER, name: 'My own plan', grade: 5, created_at: '2026-11-01T08:00:00.000Z' },
      { id: KID_CAPS, school_id: LEARNER_SCHOOL, teacher_id: LEARNER, name: 'Grade 5 (my own)', grade: 5, created_at: '2026-11-02T08:00:00.000Z' },
    ],
    enrolments: [
      { class_id: KID_OWN, child_id: KID },
      { class_id: KID_CAPS, child_id: KID },
    ],
    parent_links: [],
    parent_invite_codes: [],
    ...over,
  })
}

const codes = (db: MemoryDb) => db.tables.parent_invite_codes!
const links = (db: MemoryDb) => db.tables.parent_links!

/** A source of bytes that gives the same code every time, so a collision can be made on purpose. */
const fixedBytes = (code: string) => (n: number) => {
  const bytes = new Uint8Array(n)
  for (let i = 0; i < n; i++) bytes[i] = PARENT_CODE_ALPHABET.indexOf(code[i % PARENT_CODE_LENGTH]!)
  return bytes
}

describe('making a code', () => {
  test('is 6 letters and numbers with no look-alikes: no 0, O, 1, I or L', () => {
    expect(PARENT_CODE_LENGTH).toBe(6)
    expect(PARENT_CODE_ALPHABET).not.toMatch(/[01OIL]/)
    for (let i = 0; i < 300; i++) {
      const code = newParentCode()
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
      expect(isParentCode(code)).toBe(true)
    }
  })

  test('uses the whole alphabet and is not the same every time', () => {
    const seen = new Set<string>()
    const letters = new Set<string>()
    for (let i = 0; i < 400; i++) {
      const code = newParentCode()
      seen.add(code)
      for (const c of code) letters.add(c)
    }
    expect(seen.size).toBeGreaterThan(390)
    expect(letters.size).toBe(PARENT_CODE_ALPHABET.length)
  })

  test('skips a byte that would make some letters likelier than others', () => {
    // 256 % 31 = 8, so bytes 248 to 255 are skipped. Byte 250 would have made a "C" (250 % 31 = 2); a source that starts with it still gives a full code
    // from the later bytes (byte 0 is an "A"), and the skipped byte never shows.
    const bytes = [...Array(8).fill(250), ...Array(PARENT_CODE_LENGTH * 2 - 8).fill(0)]
    const code = newParentCode(() => Uint8Array.from(bytes))
    expect(PARENT_CODE_ALPHABET[250 % PARENT_CODE_ALPHABET.length]).toBe('C')
    expect(code).toBe('AAAAAA')
  })

  test('works for 7 days from the moment it was made', () => {
    expect(PARENT_CODE_DAYS).toBe(7)
    expect(parentCodeExpiry(NOW)).toBe('2026-11-23T10:00:00.000Z')
  })

  test('a person may type it in any case with spaces and dashes', () => {
    expect(cleanParentCode(' k7m-2qx ')).toBe('K7M2QX')
    expect(cleanParentCode('k7 m2 qx')).toBe('K7M2QX')
    expect(cleanParentCode(undefined)).toBe('')
    expect(cleanParentCode(42)).toBe('')
    expect(isParentCode('K7M2QX')).toBe(true)
    for (const bad of ['', 'K7M2Q', 'K7M2QXX', 'K7M2Q0', 'K7M2QO', 'K7M2Q1', 'K7M2QI', 'K7M2QL', 'k7m2qx', 'K7M 2QX']) expect(isParentCode(bad), bad).toBe(false)
  })

  test('is stored for the learner with an expiry 7 days on, and the learner can read it back', async () => {
    const db = world()
    const made = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    expect(made.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/)
    expect(made.expiresAt).toBe('2026-11-23T10:00:00.000Z')
    expect(codes(db)).toHaveLength(1)
    expect(codes(db)[0]).toMatchObject({ child_id: KID, code: made.code, expires_at: '2026-11-23T10:00:00.000Z' })
    expect(await currentParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)).toEqual(made)
  })

  test('a new code replaces the old one: only one is kept and the old one is gone', async () => {
    const db = world()
    const first = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    const second = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, new Date(NOW.getTime() + DAY))
    expect(second.code).not.toBe(first.code)
    expect(codes(db)).toHaveLength(1)
    expect(codes(db)[0]).toMatchObject({ code: second.code, expires_at: '2026-11-24T10:00:00.000Z' })
    // The old code no longer links anyone.
    expect(await linkParentWithCode(db, { parentId: PARENT, code: first.code }, NOW)).toEqual({ ok: false, reason: BAD_CODE })
    expect(links(db)).toEqual([])
  })

  test('two learners each keep their own code', async () => {
    const db = world()
    const a = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    const b = await makeParentCode(db, { childId: OTHER_KID, actorUserId: OTHER_LEARNER }, NOW)
    expect(a.code).not.toBe(b.code)
    expect(codes(db)).toHaveLength(2)
  })

  test('another learner already has the code that came up: a different one is made', async () => {
    const db = world()
    const taken = await makeParentCode(db, { childId: OTHER_KID, actorUserId: OTHER_LEARNER }, NOW, fixedBytes('AAAAAA'))
    expect(taken.code).toBe('AAAAAA')
    // The memory database does not know the unique rule, so stand in for it: the first insert of AAAAAA is refused.
    const real = db.from.bind(db)
    let refused = 0
    ;(db as unknown as { from: (t: string) => unknown }).from = (table: string) => {
      const q = real(table as never) as unknown as Record<string, (...a: unknown[]) => unknown>
      if (table !== 'parent_invite_codes') return q
      return new Proxy(q, {
        get(target, key) {
          if (key !== 'insert') return target[key as string]
          return (row: Row) => {
            if (row.code === 'AAAAAA') {
              refused++
              const refusal = { select: () => refusal, single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) }
              return refusal
            }
            return target.insert!(row)
          }
        },
      })
    }
    let calls = 0
    const bytes = (n: number) => (calls++ === 0 ? fixedBytes('AAAAAA')(n) : fixedBytes('BCDEFG')(n))
    const made = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW, bytes)
    expect(refused).toBe(1)
    expect(made.code).toBe('BCDEFG')
  })

  test('only the learner themselves makes it: another login, a parent and a stranger are refused, and nothing is stored', async () => {
    const db = world()
    for (const actor of [OTHER_LEARNER, PARENT, TEACHER, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc']) {
      await expect(makeParentCode(db, { childId: KID, actorUserId: actor }, NOW), actor).rejects.toThrow(ParentCodeError)
    }
    await expect(makeParentCode(db, { childId: '99999999-9999-4999-8999-999999999999', actorUserId: LEARNER }, NOW)).rejects.toThrow(ParentCodeError)
    expect(codes(db)).toEqual([])
  })

  test('is only for a learner who signed up alone: a school learner and a private twin are refused', async () => {
    const db = world()
    await expect(makeParentCode(db, { childId: SCHOOL_KID, actorUserId: SCHOOL_LEARNER }, NOW)).rejects.toThrow('A code is for a learner who signed up on their own.')
    await expect(makeParentCode(db, { childId: TWIN, actorUserId: SCHOOL_LEARNER }, NOW)).rejects.toThrow(ParentCodeError)
    expect(codes(db)).toEqual([])
  })

  test('a code past its 7 days is not shown any more, and a stranger cannot read it', async () => {
    const db = world()
    await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    expect(await currentParentCode(db, { childId: KID, actorUserId: LEARNER }, new Date(NOW.getTime() + 7 * DAY - 1))).not.toBeNull()
    expect(await currentParentCode(db, { childId: KID, actorUserId: LEARNER }, new Date(NOW.getTime() + 7 * DAY))).toBeNull()
    await expect(currentParentCode(db, { childId: KID, actorUserId: PARENT }, NOW)).rejects.toThrow(ParentCodeError)
  })

  test('a learner with no code has none to show', async () => {
    expect(await currentParentCode(world(), { childId: KID, actorUserId: LEARNER }, NOW)).toBeNull()
  })
})

describe('linking a parent with the code', () => {
  test('makes an approved link on the learner’s own CAPS class, takes the code away, and answers the learner', async () => {
    const db = world()
    const { code } = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    const result = await linkParentWithCode(db, { parentId: PARENT, code }, new Date(NOW.getTime() + DAY))
    expect(result).toEqual({ ok: true, childId: KID, firstName: 'Neo' })
    expect(links(db)).toHaveLength(1)
    expect(links(db)[0]).toMatchObject({
      parent_id: PARENT,
      child_id: KID,
      class_id: KID_CAPS,
      status: 'approved',
      consent: { guardian: true, teach: true, improve: false },
      decided_at: new Date(NOW.getTime() + DAY).toISOString(),
    })
    expect(codes(db)).toEqual([])
  })

  test('the parent may type the code in small letters with spaces', async () => {
    const db = world()
    const { code } = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    const typed = `${code.slice(0, 3)} ${code.slice(3)}`.toLowerCase()
    expect(await linkParentWithCode(db, { parentId: PARENT, code: typed }, NOW)).toMatchObject({ ok: true, childId: KID })
  })

  test('a code works once: the second parent with it is refused and no second link is made', async () => {
    const db = world()
    const { code } = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    expect(await linkParentWithCode(db, { parentId: PARENT, code }, NOW)).toMatchObject({ ok: true })
    expect(await linkParentWithCode(db, { parentId: SECOND_PARENT, code }, NOW)).toEqual({ ok: false, reason: BAD_CODE })
    expect(await linkParentWithCode(db, { parentId: PARENT, code }, NOW)).toEqual({ ok: false, reason: BAD_CODE })
    expect(links(db).map((l) => l.parent_id)).toEqual([PARENT])
  })

  test('a second guardian links with a new code, so a learner may have two linked parents', async () => {
    const db = world()
    const first = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    await linkParentWithCode(db, { parentId: PARENT, code: first.code }, NOW)
    const second = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    expect(await linkParentWithCode(db, { parentId: SECOND_PARENT, code: second.code }, NOW)).toMatchObject({ ok: true })
    expect(links(db).map((l) => l.parent_id)).toEqual([PARENT, SECOND_PARENT])
  })

  test('a code past its 7 days is refused in words, nothing is linked and the code is gone', async () => {
    const db = world()
    const { code } = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    expect(await linkParentWithCode(db, { parentId: PARENT, code }, new Date(NOW.getTime() + 7 * DAY))).toEqual({ ok: false, reason: OLD_CODE })
    expect(links(db)).toEqual([])
    expect(codes(db)).toEqual([])
  })

  test('the last second of the 7 days still works', async () => {
    const db = world()
    const { code } = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    expect(await linkParentWithCode(db, { parentId: PARENT, code }, new Date(NOW.getTime() + 7 * DAY - 1000))).toMatchObject({ ok: true })
  })

  test('a code nobody has, a code of the wrong shape and no code at all are refused with the same words, and touch nothing', async () => {
    const db = world()
    await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    for (const code of ['ZZZZZZ', '', '   ', 'abc', 'K7M2Q0', 'TOOLONGCODE', undefined, null, 7]) {
      expect(await linkParentWithCode(db, { parentId: PARENT, code }, NOW), String(code)).toEqual({ ok: false, reason: BAD_CODE })
    }
    expect(links(db)).toEqual([])
    expect(codes(db)).toHaveLength(1)
  })

  test('only a parent may use a code: a learner, a teacher and a login with no profile are refused, and the code stays', async () => {
    const db = world()
    const { code } = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    for (const actor of [OTHER_LEARNER, TEACHER, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc']) {
      expect(await linkParentWithCode(db, { parentId: actor, code }, NOW), actor).toEqual({ ok: false, reason: 'Only a parent can link a child.' })
    }
    expect(links(db)).toEqual([])
    expect(codes(db)).toHaveLength(1)
  })

  test('a parent who is already linked is not linked twice, and the code is used up', async () => {
    const db = world({ parent_links: [{ id: 'l1', parent_id: PARENT, child_id: KID, class_id: KID_CAPS, status: 'approved' }] })
    const { code } = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    expect(await linkParentWithCode(db, { parentId: PARENT, code }, NOW)).toMatchObject({ ok: true, childId: KID })
    expect(links(db)).toHaveLength(1)
    expect(codes(db)).toEqual([])
  })

  test('a link that was waiting or turned down becomes approved, and no second link is made', async () => {
    for (const status of ['pending', 'declined']) {
      const db = world({ parent_links: [{ id: 'l1', parent_id: PARENT, child_id: KID, class_id: KID_CAPS, status }] })
      const { code } = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
      expect(await linkParentWithCode(db, { parentId: PARENT, code }, NOW), status).toMatchObject({ ok: true })
      expect(links(db)).toHaveLength(1)
      expect(links(db)[0]).toMatchObject({ id: 'l1', status: 'approved', consent: { guardian: true, teach: true, improve: false } })
    }
  })

  test('with no CAPS class of the grade, the link is tied to the first class the learner is in', async () => {
    const db = world({
      classes: [{ id: KID_OWN, school_id: LEARNER_SCHOOL, teacher_id: LEARNER, name: 'My own plan', grade: 5, created_at: '2026-11-01T08:00:00.000Z' }],
      enrolments: [{ class_id: KID_OWN, child_id: KID }],
    })
    const { code } = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    expect(await linkParentWithCode(db, { parentId: PARENT, code }, NOW)).toMatchObject({ ok: true })
    expect(links(db)[0]).toMatchObject({ class_id: KID_OWN })
  })

  test('a learner with no class cannot be linked: the parent is told to try again and the code is put back', async () => {
    const db = world({ enrolments: [] })
    const { code } = await makeParentCode(db, { childId: KID, actorUserId: LEARNER }, NOW)
    const result = await linkParentWithCode(db, { parentId: PARENT, code }, NOW)
    expect(result).toEqual({ ok: false, reason: 'Could not link your child. Try again.' })
    expect(links(db)).toEqual([])
    expect(codes(db)).toHaveLength(1)
    expect(codes(db)[0]).toMatchObject({ child_id: KID, code })
  })

  test('a code that points at a school learner is refused (only a code made by this feature works, and it is never made for a school learner)', async () => {
    const db = world({ parent_invite_codes: [{ child_id: SCHOOL_KID, code: 'K7M2QX', expires_at: '2026-11-23T10:00:00.000Z' }] })
    expect(await linkParentWithCode(db, { parentId: PARENT, code: 'K7M2QX' }, NOW)).toEqual({ ok: false, reason: BAD_CODE })
    expect(links(db)).toEqual([])
  })
})
