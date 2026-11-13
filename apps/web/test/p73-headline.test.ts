// @vitest-environment node
import { describe, expect, test, vi } from 'vitest'

// The class list headline stays short (P73, decision 2). The sentence builder is a pure function: no database in these tests.

vi.mock('../lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }))
vi.mock('../lib/supabase/admin', () => ({ createSupabaseAdmin: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { classesHeadline, type HeadlineClass } from '../lib/data/p21'

/** A class that needs the teacher for `n` things, `papers` of them papers. */
const needs = (label: string, n: number, papers = n): HeadlineClass => ({ label, needs: n, papers, tests: 1 })
/** A class with a test and nothing waiting for the teacher. */
const quiet = (label: string): HeadlineClass => ({ label, needs: 0, papers: 0, tests: 2 })
/** A class with no test yet. */
const empty = (label: string): HeadlineClass => ({ label, needs: 0, papers: 0, tests: 0 })

describe('one or two sentences: the text is the same as before', () => {
  test('no class: create the first one', () => {
    expect(classesHeadline([])).toBe('Create your first class to get started.')
  })

  test('nothing to say', () => {
    expect(classesHeadline([quiet('6B'), quiet('6C'), quiet('7A'), quiet('7B')])).toBe('Everything is up to date.')
  })

  test('one class that needs you, with papers or with things', () => {
    expect(classesHeadline([needs('6B', 2)])).toBe('6B needs you for two papers.')
    expect(classesHeadline([needs('6B', 1)])).toBe('6B needs you for one paper.')
    expect(classesHeadline([needs('6B', 3, 1)])).toBe('6B needs you for three things.')
  })

  test('one class waiting to be set up', () => {
    expect(classesHeadline([empty('6B')])).toBe('6B is waiting to be set up.')
  })

  test('two sentences are both said', () => {
    expect(classesHeadline([needs('6B', 2), needs('6C', 1)])).toBe('6B needs you for two papers. 6C needs you for one paper.')
    expect(classesHeadline([needs('6B', 2), empty('6C')])).toBe('6B needs you for two papers. 6C is waiting to be set up.')
    expect(classesHeadline([empty('6B'), empty('6C')])).toBe('6B is waiting to be set up. 6C is waiting to be set up.')
    // classes with nothing to say add no sentence, so four classes can still make two
    expect(classesHeadline([needs('6B', 2), quiet('6C'), empty('7A'), quiet('7B')])).toBe('6B needs you for two papers. 7A is waiting to be set up.')
  })
})

describe('three or more sentences: the heading says how many, not which', () => {
  test('three classes need you, two are waiting', () => {
    expect(classesHeadline([needs('6B', 2), needs('6C', 1), needs('7A', 4), empty('7B'), empty('7C')])).toBe('Three classes need you. Two are waiting to be set up.')
  })

  test('one class needs you: its own sentence, then the number waiting', () => {
    expect(classesHeadline([needs('6B', 2), empty('6C'), empty('7A'), empty('7B')])).toBe('6B needs you for two papers. Three are waiting to be set up.')
  })

  test('one is waiting: its own sentence', () => {
    expect(classesHeadline([needs('6B', 2), needs('6C', 1), needs('7A', 1), empty('7B')])).toBe('Three classes need you. 7B is waiting to be set up.')
  })

  test('only classes that need you', () => {
    expect(classesHeadline([needs('6B', 1), needs('6C', 1), needs('7A', 1), needs('7B', 1)])).toBe('Four classes need you.')
  })

  test('only classes waiting to be set up: it says which kind of thing is waiting', () => {
    expect(classesHeadline([empty('6B'), empty('6C'), empty('7A')])).toBe('Three classes are waiting to be set up.')
  })

  test('a class that needs you and has no test yet is counted once, as needing you', () => {
    const both: HeadlineClass = { label: '6B', needs: 1, papers: 1, tests: 0 }
    expect(classesHeadline([both, needs('6C', 1), needs('7A', 1)])).toBe('Three classes need you.')
  })

  test('a class with a test and nothing to do adds nothing', () => {
    expect(classesHeadline([needs('6B', 1), needs('6C', 1), needs('7A', 1), quiet('7B'), quiet('7C')])).toBe('Three classes need you.')
  })

  test('numbers past ten are written as digits, the way numberWord does it', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => needs(`C${i}`, 1))
    expect(classesHeadline(twelve)).toBe('12 classes need you.')
  })
})
