// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// P137: the teacher sees the real tokens the AI used ("AI used 12,345 tokens") with a small split by kind of work, read from `ai_usage` with the
// teacher's own client (row-level security decides what is theirs). With no table, no rows or an error it shows nothing and never throws.
// The component is rendered from given rows and a fake client: no server, no browser, no database.

vi.mock('../lib/supabase/server', () => ({ createSupabaseServer: vi.fn() }))

import { AiTokens, AiTokensView, groupOf, summariseUsage, thousands, type UsageRow } from '@/components/AiTokens'
import { createSupabaseServer } from '../lib/supabase/server'

const row = (job: string, total: number | null, over: Partial<UsageRow> = {}): UsageRow => ({
  job,
  prompt_tokens: total === null ? null : Math.floor(total * 0.8),
  completion_tokens: total === null ? null : total - Math.floor(total * 0.8),
  total_tokens: total,
  reported: total !== null,
  ...over,
})

const ROWS: UsageRow[] = [row('write_lesson', 8000), row('write_lesson', 1000), row('read_paper', 2000), row('read_marked_test', 345), row('diagnose', 600), row('class_report', 400)]
/** The em dash, written as a code so this file has none in it. */
const DASH = String.fromCharCode(0x2014)
const html = (node: unknown) => renderToStaticMarkup(node as never)
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

type Page = { data: unknown[] | null; error: unknown }
/** A client whose `ai_usage` query answers the given pages in turn, and keeps what was asked. */
function fakeClient(...pages: Page[]) {
  const asked = { tables: [] as string[], filters: [] as Array<[string, string]>, from: [] as number[] }
  let next = 0
  const chain: Record<string, unknown> = {
    select: () => chain,
    order: () => chain,
    range: (from: number) => {
      asked.from.push(from)
      return chain
    },
    eq: (column: string, value: string) => {
      asked.filters.push([column, value])
      return chain
    },
    then: (resolveWith: (page: Page) => unknown) => resolveWith(pages[Math.min(next++, pages.length - 1)]!),
  }
  vi.mocked(createSupabaseServer).mockResolvedValue({
    from: (table: string) => {
      asked.tables.push(table)
      return chain
    },
  } as never)
  return asked
}

beforeEach(() => {
  vi.mocked(createSupabaseServer).mockReset()
})

describe('AiTokensView', () => {
  it('says how many tokens the AI used, with thousands marked by commas', () => {
    expect(text(html(<AiTokensView rows={ROWS} whose="class" />))).toContain('AI used 12,345 tokens')
  })

  it('splits the tokens by kind of work, the biggest first, in plain words', () => {
    const out = text(html(<AiTokensView rows={ROWS} whose="class" />))
    expect(out).toContain('Lessons 9,000')
    expect(out).toContain('Photo reading 2,345')
    expect(out).toContain('Marking 600')
    expect(out).toContain('Analysis 400')
    expect(out.indexOf('Lessons')).toBeLessThan(out.indexOf('Photo reading'))
    expect(out.indexOf('Photo reading')).toBeLessThan(out.indexOf('Marking'))
    expect(out.indexOf('Marking')).toBeLessThan(out.indexOf('Analysis'))
  })

  it('names whose tokens they are', () => {
    expect(text(html(<AiTokensView rows={ROWS} whose="class" />))).toContain('for this class')
    expect(text(html(<AiTokensView rows={ROWS} whose="learner" />))).toContain('for this learner')
  })

  it('counts a row with no total as its prompt and completion tokens added up', () => {
    const rows = [row('write_lesson', null, { prompt_tokens: 70, completion_tokens: 30, reported: true })]
    expect(text(html(<AiTokensView rows={rows} whose="class" />))).toContain('AI used 100 tokens')
  })

  it('says so when some calls did not report their tokens, and never makes a number up for them', () => {
    const out = text(html(<AiTokensView rows={[...ROWS, row('read_paper', null), row('read_paper', null)]} whose="class" />))
    expect(out).toContain('AI used 12,345 tokens')
    expect(out).toContain('2 AI calls did not report their tokens')
  })

  it('when no call reported anything it says only that, with no number', () => {
    const out = text(html(<AiTokensView rows={[row('read_paper', null)]} whose="class" />))
    expect(out).toContain('did not report its tokens')
    expect(out).not.toMatch(/AI used/)
  })

  it('shows nothing when there are no rows', () => {
    expect(html(<AiTokensView rows={[]} whose="class" />)).toBe('')
  })

  it('has no em dash and no jargon words in what it says', () => {
    const out = text(html(<AiTokensView rows={[...ROWS, row('draft_map', 50), row('read_paper', null)]} whose="learner" />))
    expect(out).not.toContain(DASH)
    expect(out).not.toMatch(/write_lesson|read_paper|diagnose|class_report|draft_map|ai_usage/)
  })
})

describe('summariseUsage and its words', () => {
  it('puts every job under one of five kinds', () => {
    expect(['write_lesson', 'read_paper', 'read_marked_test', 'read_key', 'diagnose', 'class_report', 'guidance', 'long_view', 'draft_map', 'map_records'].map(groupOf)).toEqual([
      'Lessons',
      'Photo reading',
      'Photo reading',
      'Photo reading',
      'Marking',
      'Analysis',
      'Analysis',
      'Analysis',
      'Other',
      'Other',
    ])
    expect(groupOf('a_job_nobody_has_heard_of')).toBe('Other')
  })

  it('adds up the tokens by kind and counts the calls that did not report', () => {
    const s = summariseUsage([...ROWS, row('guidance', null)])
    expect(s.total).toBe(12_345)
    expect(s.unreported).toBe(1)
    expect(s.groups).toEqual([
      { label: 'Lessons', tokens: 9000 },
      { label: 'Photo reading', tokens: 2345 },
      { label: 'Marking', tokens: 600 },
      { label: 'Analysis', tokens: 400 },
    ])
  })

  it('writes thousands with commas', () => {
    expect([0, 7, 999, 1000, 12_345, 1_234_567].map(thousands)).toEqual(['0', '7', '999', '1,000', '12,345', '1,234,567'])
  })
})

describe('AiTokens', () => {
  it('reads the class rows with the teacher client and shows the total', async () => {
    const asked = fakeClient({ data: ROWS, error: null })
    const out = text(html(await AiTokens({ classId: 'class-1' })))
    expect(asked.tables).toEqual(['ai_usage'])
    expect(asked.filters).toEqual([['class_id', 'class-1']])
    expect(out).toContain('AI used 12,345 tokens')
    expect(out).toContain('for this class')
  })

  it('reads the learner rows by the learner id', async () => {
    const asked = fakeClient({ data: ROWS, error: null })
    const out = text(html(await AiTokens({ childId: 'child-1' })))
    expect(asked.filters).toEqual([['child_id', 'child-1']])
    expect(out).toContain('for this learner')
  })

  it('reads on while a page is full, so a busy class is not cut at the first thousand rows', async () => {
    const full = Array.from({ length: 1000 }, () => row('write_lesson', 10))
    const asked = fakeClient({ data: full, error: null }, { data: [row('read_paper', 5)], error: null })
    const out = text(html(await AiTokens({ classId: 'class-1' })))
    expect(asked.from).toEqual([0, 1000])
    expect(out).toContain('AI used 10,005 tokens')
  })

  it('shows nothing when the table is missing or the read is refused, and does not throw', async () => {
    fakeClient({ data: null, error: { message: 'relation "public.ai_usage" does not exist' } })
    expect(html(await AiTokens({ classId: 'class-1' }))).toBe('')
  })

  it('shows nothing when a later page fails: a number that is too low is worse than none', async () => {
    const full = Array.from({ length: 1000 }, () => row('write_lesson', 10))
    fakeClient({ data: full, error: null }, { data: null, error: { message: 'timeout' } })
    expect(html(await AiTokens({ classId: 'class-1' }))).toBe('')
  })

  it('shows nothing when the class has no rows yet', async () => {
    fakeClient({ data: [], error: null })
    expect(html(await AiTokens({ classId: 'class-1' }))).toBe('')
  })

  it('shows nothing when the client cannot even be made', async () => {
    vi.mocked(createSupabaseServer).mockImplementation(async () => {
      throw new Error('no cookies here')
    })
    expect(html(await AiTokens({ classId: 'class-1' }))).toBe('')
  })

  it('shows nothing when it is given neither a class nor a learner', async () => {
    const asked = fakeClient({ data: ROWS, error: null })
    expect(html(await AiTokens({}))).toBe('')
    expect(asked.tables).toEqual([])
  })
})

describe('the two teacher pages', () => {
  const webRoot = resolve(import.meta.dirname, '..')
  const read = (file: string) => readFileSync(resolve(webRoot, file), 'utf8')

  it('the class gap page and the learner page each have one line that shows it', () => {
    const gap = read('app/t/[classId]/gaps/[topicKey]/page.tsx')
    const learner = read('app/t/[classId]/learners/[childId]/page.tsx')
    expect(gap.match(/<AiTokens /g)).toHaveLength(1)
    expect(gap).toContain('<AiTokens classId={classId} />')
    expect(learner.match(/<AiTokens /g)).toHaveLength(1)
    expect(learner).toContain('<AiTokens childId={v.id} />')
  })

  it('the component file has no em dash', () => {
    expect(read('components/AiTokens.tsx')).not.toContain(DASH)
  })
})
