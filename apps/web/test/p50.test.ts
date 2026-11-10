import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, approvalText, mergeLog, timeLabel, toolLabel, whoRan, type ApprovalRow, type ToolCallRow } from '@/lib/data/p50'

const tool = (over: Partial<ToolCallRow> = {}): ToolCallRow => ({
  id: 't1',
  server: 'jemma',
  tool: 'save_answer_key',
  via: 'cloud',
  engine: null,
  model: null,
  input: { testId: 'abc' },
  output: { saved: 5 },
  ok: true,
  error: null,
  started_at: '2026-11-10T08:30:00.123456+00:00',
  duration_ms: 120,
  ...over,
})

const approval = (over: Partial<ApprovalRow> = {}): ApprovalRow => ({
  id: 'a1',
  kind: 'topic_map',
  decision: 'approved',
  decided_by_name: 'Ms Banda',
  decided_at: '2026-11-10T08:31:00.5+00:00',
  note: null,
  ...over,
})

describe('plain labels', () => {
  it('names a Jemma tool in plain words and falls back to the raw name', () => {
    expect(toolLabel('jemma', 'save_answer_key')).toBe('Saved an answer key')
    expect(toolLabel('jemma', 'get_paper')).toBe('Read a paper')
    expect(toolLabel('jemma', 'something_new')).toBe('something_new')
  })

  it('names a call to another server by its tool and server', () => {
    expect(toolLabel('files', 'read_file')).toBe('read_file on files')
    expect(toolLabel('runner', 'agent_run')).toBe('Agent run, tokens and cost')
  })

  it('says who ran it', () => {
    expect(whoRan(tool({ via: 'cloud' }))).toBe('Jemma cloud')
    expect(whoRan(tool({ via: 'mcp' }))).toBe('Agent through MCP')
    expect(whoRan(tool({ via: 'runner', engine: 'goose', model: 'some/model' }))).toBe('Runner: goose, some/model')
    expect(whoRan(tool({ via: 'runner', engine: 'claude', model: null }))).toBe('Runner: claude')
    expect(whoRan(tool({ via: 'runner', engine: null, model: null }))).toBe('Runner')
  })

  it('says what a person did in plain words', () => {
    expect(approvalText(approval())).toBe('Ms Banda approved the topic map')
    expect(approvalText(approval({ kind: 'answer_key', decided_by_name: 'Mr Dube' }))).toBe('Mr Dube approved the answer key')
    expect(approvalText(approval({ kind: 'guardian_link', decision: 'declined' }))).toBe("Ms Banda declined a parent's request to link")
    expect(approvalText(approval({ kind: 'guardian_link', decision: 'approved' }))).toBe("Ms Banda approved a parent's request to link")
    expect(approvalText(approval({ kind: 'mark', decision: 'edited' }))).toBe('Ms Banda changed an answer on a paper')
    expect(approvalText(approval({ kind: 'homework_scan', decision: 'confirmed', decided_by_name: 'Thandi M' }))).toBe('Thandi M confirmed a homework scan')
    expect(approvalText(approval({ kind: 'brand_new', decision: 'shared' }))).toBe('Ms Banda shared brand_new')
  })

  it('names the test when results are shared with parents, and still reads well without a title', () => {
    expect(approvalText({ ...approval({ kind: 'share_results', decision: 'shared' }), note: 'Class Test 1' })).toBe('Ms Banda shared the results of Class Test 1 with parents')
    expect(approvalText({ ...approval({ kind: 'share_results', decision: 'shared' }), note: null })).toBe('Ms Banda shared the results of a test with parents')
    expect(approvalText(approval({ kind: 'share_results', decision: 'shared' }))).toBe('Ms Banda shared the results of a test with parents')
  })

  it('shows the test title in a merged log entry', () => {
    const row = { ...approval({ kind: 'share_results', decision: 'shared' }), note: 'Class Test 1' }
    const entry = mergeLog([], [row], new Date('2026-11-10T10:00:00Z')).entries[0]
    expect(entry).toMatchObject({ kind: 'approval', text: 'Ms Banda shared the results of Class Test 1 with parents' })
  })
})

describe('time label', () => {
  const now = new Date('2026-11-10T10:00:00Z')
  it('shows only the clock for today, in South African time', () => {
    expect(timeLabel('2026-11-10T08:30:00+00:00', now)).toBe('10:30')
  })
  it('adds the day for an older entry', () => {
    expect(timeLabel('2026-11-08T16:40:00+00:00', now)).toBe('Sun 8 Nov 18:40')
  })
})

describe('the merged list', () => {
  it('puts tool calls and approvals in one list, newest first', () => {
    const page = mergeLog(
      [tool({ id: 't1', started_at: '2026-11-10T08:30:00+00:00' }), tool({ id: 't2', started_at: '2026-11-10T08:00:00+00:00' })],
      [approval({ id: 'a1', decided_at: '2026-11-10T08:15:00+00:00' })],
      new Date('2026-11-10T10:00:00Z'),
    )
    expect(page.entries.map((e) => e.id)).toEqual(['t1', 'a1', 't2'])
    expect(page.entries.map((e) => e.kind)).toEqual(['tool', 'approval', 'tool'])
    expect(page.olderCursor).toBeNull()
  })

  it('keeps 50 entries and hands back the exact time of the last one for "Show older"', () => {
    const tools = Array.from({ length: 40 }, (_, i) => tool({ id: `t${i}`, started_at: `2026-11-10T08:${String(59 - i).padStart(2, '0')}:00.123456+00:00` }))
    const approvals = Array.from({ length: 20 }, (_, i) => approval({ id: `a${i}`, decided_at: `2026-11-10T07:${String(59 - i).padStart(2, '0')}:00.654321+00:00` }))
    const page = mergeLog(tools, approvals, new Date('2026-11-10T10:00:00Z'))
    expect(page.entries).toHaveLength(PAGE_SIZE)
    // 40 tool calls come first (08:xx), then the first 10 approvals (07:59 down to 07:50).
    expect(page.entries[49]!.id).toBe('a9')
    expect(page.olderCursor).toBe('2026-11-10T07:50:00.654321+00:00')
  })

  it('has no older page when everything fits', () => {
    const page = mergeLog([tool()], [], new Date('2026-11-10T10:00:00Z'))
    expect(page.olderCursor).toBeNull()
  })

  it('formats input and output as JSON and shows the error of a failed call', () => {
    const page = mergeLog([tool({ ok: false, output: null, error: 'it broke' })], [], new Date('2026-11-10T10:00:00Z'))
    const e = page.entries[0]!
    expect(e.kind).toBe('tool')
    if (e.kind !== 'tool') return
    expect(e.failed).toBe(true)
    expect(e.input).toBe('{\n  "testId": "abc"\n}')
    expect(e.output).toBe('it broke')
  })
})
