import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { buildImportSql, dollarQuote } from '../import'
import { goodLesson, topicFile } from './fixtures'

describe('dollarQuote', () => {
  test('wraps a text so that quotes, backslashes and $$ in it are safe', () => {
    const q = dollarQuote(`it's "x" \\ $$ ok`)
    expect(q.startsWith('$jemma$')).toBe(true)
    expect(q.endsWith('$jemma$')).toBe(true)
    expect(q).toContain(`it's "x" \\ $$ ok`)
  })

  test('refuses a text that holds the tag itself, and a text with a NUL character', () => {
    expect(() => dollarQuote('a $jemma$ b')).toThrow(/\$jemma\$/)
    expect(() => dollarQuote(`a${String.fromCharCode(0)}b`)).toThrow(/NUL/)
  })
})

describe('buildImportSql', () => {
  let root: string
  beforeEach(() => void (root = mkdtempSync(join(tmpdir(), 'teach-imp-'))))
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const write = (grade: number, name: string, body: unknown) => {
    mkdirSync(join(root, `content/lessons/grade-${grade}`), { recursive: true })
    writeFileSync(join(root, `content/lessons/grade-${grade}/${name}.json`), JSON.stringify(body))
  }

  test('one transaction, ready lessons only, with the key columns', () => {
    const second = goodLesson({ position: 2, title: 'Second lesson' })
    write(6, 'common-fractions', topicFile({ lessons: [goodLesson(), second], status: [{ position: 1, status: 'ready', problems: [], writer: 'opencode/a-free', reviewer: 'opencode/b-free' }, { position: 2, status: 'ready', problems: [], writer: 'opencode/c-free', reviewer: 'opencode/b-free' }] }))
    const { sql, lessons, topics } = buildImportSql(root, { version: 1 })
    expect(lessons).toBe(2)
    expect(topics).toBe(1)
    expect(sql.startsWith('begin;')).toBe(true)
    expect(sql.trimEnd().endsWith('commit;')).toBe(true)
    expect(sql).toContain('insert into topic_lessons (grade, base_name, family, position, title, content, source, status, checks, model, version)')
    expect(sql).toContain('on conflict (grade, base_name, position, version) do update set')
    expect(sql).toContain("'ready'")
    expect(sql).toContain('$jemma$Common fractions$jemma$')
    expect(sql).toContain('$jemma$Second lesson$jemma$')
    expect(sql).toContain('$jemma$opencode/c-free$jemma$')
    expect((sql.match(/insert into topic_lessons/g) ?? []).length).toBe(2)
  })

  test('a failed lesson is not imported, and a status without a lesson is not either', () => {
    write(6, 'common-fractions', topicFile({ status: [{ position: 1, status: 'ready', problems: [], writer: 'a', reviewer: 'b' }, { position: 2, status: 'failed', problems: ['block 2: wrong'], writer: 'a', reviewer: 'b' }] }))
    const { sql, lessons } = buildImportSql(root, { version: 1 })
    expect(lessons).toBe(1)
    expect(sql).not.toContain('block 2: wrong')
  })

  test('a lesson whose status says failed is left out even when its text is in the file', () => {
    write(6, 'common-fractions', topicFile({ lessons: [goodLesson()], status: [{ position: 1, status: 'failed', problems: ['x'], writer: 'a', reviewer: 'b' }] }))
    expect(buildImportSql(root, { version: 1 }).lessons).toBe(0)
  })

  test("survives a lesson text with ' and $$ in it", () => {
    const tricky = goodLesson({ title: `Mia's "half" costs $$5 and \\ it's fine`, summary: ["It's a $$ sign", 'Plain line', 'Another line'] })
    write(6, 'common-fractions', topicFile({ lessons: [tricky] }))
    const { sql } = buildImportSql(root, { version: 1 })
    expect(sql).toContain(`Mia's "half" costs $$5 and \\ it's fine`)
    expect(sql).toContain(`It's a $$ sign`)
    // no single quote is ever opened outside a dollar quote: the only quoted strings are the literal 'ready'
    const outside = sql.replace(/\$jemma\$[\s\S]*?\$jemma\$/g, '')
    expect(outside.match(/'/g)?.length ?? 0).toBe(2 * (outside.match(/'ready'/g)?.length ?? 0))
  })

  test('a file that does not match the lesson shape stops the import with its name', () => {
    write(6, 'broken', { grade: 6 })
    expect(() => buildImportSql(root, { version: 1 })).toThrow(/broken/)
  })

  test('the version is carried, and an empty folder gives an empty transaction', () => {
    expect(buildImportSql(root, { version: 3 }).lessons).toBe(0)
    write(6, 'common-fractions', topicFile())
    expect(buildImportSql(root, { version: 3 }).sql).toMatch(/, 3\)/)
  })
})
