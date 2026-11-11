// @vitest-environment node
import { describe, expect, test, vi } from 'vitest'

// Two learners with the same first name in one class. The teacher gives a surname to one of them at least, and the parent's link
// form asks for the surname only when the first name alone does not say which child.

vi.mock('../lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }))
vi.mock('../lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }))

import { sameNameProblem } from '../lib/class-writes'
import { matchChild } from '../lib/data/p22'

const kid = (id: string, firstName: string, lastName: string | null = null) => ({ id, firstName, lastName })

describe('matchChild (p22): which child the parent means', () => {
  test('one child with that first name: that child, whatever case and spaces', () => {
    const rows = [kid('a', 'Amina'), kid('t', 'Thabo')]
    expect(matchChild(rows, '  amina ')).toEqual({ kind: 'one', child: rows[0] })
    expect(matchChild(rows, 'Zola')).toEqual({ kind: 'none' })
    expect(matchChild(rows, '')).toEqual({ kind: 'none' })
  })

  test('a surname typed for the only child with that name must agree when the child has one', () => {
    const rows = [kid('a', 'Amina', 'Dlamini')]
    expect(matchChild(rows, 'Amina', 'dlamini')).toEqual({ kind: 'one', child: rows[0] })
    expect(matchChild(rows, 'Amina', 'Nkosi')).toEqual({ kind: 'none' })
    expect(matchChild(rows, 'Amina')).toEqual({ kind: 'one', child: rows[0] })
    expect(matchChild([kid('a', 'Amina')], 'Amina', 'Nkosi')).toEqual({ kind: 'one', child: kid('a', 'Amina') })
  })

  test('two children with that first name: the surname picks one', () => {
    const rows = [kid('a1', 'Amina', 'Dlamini'), kid('a2', 'Amina', 'Nkosi')]
    expect(matchChild(rows, 'Amina', ' NKOSI ')).toEqual({ kind: 'one', child: rows[1] })
    expect(matchChild(rows, 'Amina', 'Dlamini')).toEqual({ kind: 'one', child: rows[0] })
  })

  test('two children and no surname typed: the form must ask', () => {
    const rows = [kid('a1', 'Amina', 'Dlamini'), kid('a2', 'Amina', 'Nkosi')]
    expect(matchChild(rows, 'Amina')).toEqual({ kind: 'many' })
    expect(matchChild(rows, 'Amina', '  ')).toEqual({ kind: 'many' })
  })

  test('two children and a surname that fits neither: no one', () => {
    const rows = [kid('a1', 'Amina', 'Dlamini'), kid('a2', 'Amina', 'Nkosi')]
    expect(matchChild(rows, 'Amina', 'Zulu')).toEqual({ kind: 'none' })
  })

  test('one of the two has no surname: leaving the surname blank means that one, and the other needs hers typed', () => {
    const rows = [kid('a1', 'Amina'), kid('a2', 'Amina', 'Nkosi')]
    expect(matchChild(rows, 'Amina')).toEqual({ kind: 'one', child: rows[0] })
    expect(matchChild(rows, 'Amina', 'Nkosi')).toEqual({ kind: 'one', child: rows[1] })
  })

  test('two children with no surname at all: the form cannot tell them apart and says so', () => {
    expect(matchChild([kid('a1', 'Amina'), kid('a2', 'Amina')], 'Amina')).toEqual({ kind: 'many' })
  })
})

describe('sameNameProblem (class-writes): the rule the teacher\'s forms keep', () => {
  test('different first names are fine with or without surnames', () => {
    expect(sameNameProblem([{ firstName: 'Amina' }, { firstName: 'Thabo' }])).toBeNull()
  })

  test('a repeated first name is fine when at most one of them has no surname', () => {
    expect(sameNameProblem([{ firstName: 'Amina' }, { firstName: 'amina', lastName: 'Nkosi' }])).toBeNull()
    expect(sameNameProblem([{ firstName: 'Amina', lastName: 'Dlamini' }, { firstName: 'Amina', lastName: 'Nkosi' }])).toBeNull()
  })

  test('two with the same first name and no surname: the problem says which name and what to do', () => {
    expect(sameNameProblem([{ firstName: 'Amina' }, { firstName: ' amina ', lastName: ' ' }])).toBe('Two learners are called Amina. Add a surname to one of them so parents can tell them apart.')
    expect(sameNameProblem([{ firstName: 'Zola' }, { firstName: 'Amina' }, { firstName: 'Amina' }, { firstName: 'Amina', lastName: 'Nkosi' }])).toBe(
      'Two learners are called Amina. Add a surname to one of them so parents can tell them apart.',
    )
  })

  test('the same first name and the same surname twice is a problem too, whatever the case', () => {
    expect(sameNameProblem([{ firstName: 'Zed', lastName: 'Okafor' }, { firstName: ' zed ', lastName: ' OKAFOR ' }])).toBe(
      'Two learners are called Zed Okafor. Change one of the names so parents can tell them apart.',
    )
  })

  test('a surname that is only spaces counts as none', () => {
    expect(sameNameProblem([{ firstName: 'Amina', lastName: '   ' }, { firstName: 'Amina', lastName: '' }])).not.toBeNull()
  })
})
