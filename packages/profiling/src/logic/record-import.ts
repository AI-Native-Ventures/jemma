import {
  COLUMN_FIELDS,
  MARKED_KINDS,
  type ColumnField,
  type ExistingRecord,
  type FileMapping,
  type ImportLearner,
  type ImportRow,
  type MarkedKind,
  type PieceKind,
  type Problem,
} from '../schemas/records'
import { DEFAULT_SUBJECT, canonicalSubject } from './strands'

// Past records brought in from a file. The model only says what each column means. Everything below is code:
// it reads every row, matches the learners, reads the marks, works out the term, and finds what is wrong.
// Pure functions, no database and no model.

/** A file may hold this many rows after its header, and be this big. */
export const MAX_ROWS = 2000
export const MAX_BYTES = 1024 * 1024
/** The model is shown this many data rows. */
export const SAMPLE_ROWS = 8

export class TableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TableError'
  }
}

export class MappingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MappingError'
  }
}

/** Said when a teacher's learners are unnamed in the file's teacher column. */
export const NO_TEACHER = 'Teacher not named'

// ---------------------------------------------------------------------------------------------------------------------
// The table: comma, tab or semicolon separated text
// ---------------------------------------------------------------------------------------------------------------------

export type RawRow = { n: number; cells: string[] }
export type RawTable = {
  header: string[]
  /** Rows after the header with something in them. `n` is the row number in the file: the header is row 1, a blank line counts. */
  rows: RawRow[]
  /** Blank lines after the header. */
  blank: number
  delimiter: ',' | '\t' | ';'
}

function detectDelimiter(text: string): ',' | '\t' | ';' {
  let tabs = 0
  let semis = 0
  let commas = 0
  let quoted = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (tabs + semis + commas > 0) break
    } else if (!quoted) {
      if (ch === '\t') tabs++
      else if (ch === ';') semis++
      else if (ch === ',') commas++
    }
  }
  if (tabs > 0) return '\t'
  return semis > commas ? ';' : ','
}

function splitRecords(text: string, delim: string): string[][] {
  const records: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const endCell = () => {
    row.push(cell.trim())
    cell = ''
  }
  const endRow = () => {
    endCell()
    records.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch !== '"') cell += ch
      else if (text[i + 1] === '"') {
        cell += '"'
        i++
      } else inQuotes = false
    } else if (ch === '"' && cell.trim() === '') {
      cell = ''
      inQuotes = true
    } else if (ch === delim) endCell()
    else if (ch === '\n') endRow()
    else if (ch === '\r') {
      if (text[i + 1] !== '\n') endRow()
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) endRow()
  return records
}

const isBlank = (cells: string[]) => cells.every((c) => c === '')

/** Reads a file or a pasted table. The first line with something in it is the header. Throws `TableError` in plain words. */
export function parseTable(input: string): RawTable {
  const text = input.replace(/^﻿/, '')
  if (text.trim() === '') throw new TableError('The file is empty.')
  const delimiter = detectDelimiter(text)
  const records = splitRecords(text, delimiter)
  const at = records.findIndex((r) => !isBlank(r))
  if (at < 0) throw new TableError('The file is empty.')
  const header = records[at]!
  const rows: RawRow[] = []
  let blank = 0
  for (let i = at + 1; i < records.length; i++) {
    const cells = records[i]!
    if (isBlank(cells)) {
      blank++
      continue
    }
    const padded = [...cells, ...Array.from({ length: Math.max(0, header.length - cells.length) }, () => '')]
    rows.push({ n: i + 1, cells: padded.slice(0, header.length) })
  }
  if (rows.length === 0) throw new TableError('The file has a header but no rows under it.')
  if (rows.length > MAX_ROWS) throw new TableError(`This file has ${rows.length.toLocaleString('en-US')} rows. Jemma reads up to ${MAX_ROWS.toLocaleString('en-US')} at a time. Split it into smaller files.`)
  return { header, rows, blank, delimiter }
}

// ---------------------------------------------------------------------------------------------------------------------
// Values: marks, dates, terms, years, grades
// ---------------------------------------------------------------------------------------------------------------------

const NUM = String.raw`\d+(?:[.,]\d+)?`
const FRACTION = new RegExp(`^(${NUM})\\s*(?:/|out of|of)\\s*(${NUM})$`, 'i')
const PERCENT = new RegExp(`^(${NUM})\\s*%$`)
const PLAIN = new RegExp(`^(${NUM})$`)
const num = (text: string) => Number(text.replace(',', '.'))

export type MarkParse = { ok: true; marks: number; outOf: number | null } | { ok: false; blank: boolean }

/** `14/20`, `14 out of 20`, `14 of 20`, `70%`, `14`, `14,5` (a decimal comma). A percent is out of 100. */
export function parseMark(text: string): MarkParse {
  const t = text.trim()
  if (t === '') return { ok: false, blank: true }
  const fraction = FRACTION.exec(t)
  if (fraction) {
    const outOf = num(fraction[2]!)
    return outOf > 0 ? { ok: true, marks: num(fraction[1]!), outOf } : { ok: false, blank: false }
  }
  const percent = PERCENT.exec(t)
  if (percent) return { ok: true, marks: num(percent[1]!), outOf: 100 }
  const plain = PLAIN.exec(t)
  if (plain) return { ok: true, marks: num(plain[1]!), outOf: null }
  return { ok: false, blank: false }
}

/** The marks and the total as whole numbers with the same share: 14,5 out of 20 is 145 out of 200. */
function wholeMarks(marks: number, outOf: number): { marks: number; outOf: number } {
  for (const k of [1, 10, 100]) {
    const m = marks * k
    const o = outOf * k
    if (Number.isInteger(Math.round(m * 1e6) / 1e6) && Number.isInteger(Math.round(o * 1e6) / 1e6)) return { marks: Math.round(m), outOf: Math.round(o) }
  }
  return { marks: Math.round(marks * 100), outOf: Math.round(outOf * 100) }
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

function isoOf(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y))

/** `2025-05-14`, `14/05/2025` (day first), `14.05.25`, `14 May 2025`, `May 14, 2025`. Null when it is not a date it can read. */
export function parseDate(text: string): string | null {
  const t = text.trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(t)
  if (m) return isoOf(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/.exec(t)
  if (m) {
    const [a, b, y] = [Number(m[1]), Number(m[2]), fullYear(m[3]!)]
    // Day first. A second number above 12 can only be the day, so the first is the month.
    return b > 12 && a <= 12 ? isoOf(y, a, b) : isoOf(y, b, a)
  }
  m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4}|\d{2})$/.exec(t)
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase()]
    return month ? isoOf(fullYear(m[3]!), month, Number(m[1])) : null
  }
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t)
  if (m) {
    const month = MONTHS[m[1]!.toLowerCase()]
    return month ? isoOf(Number(m[3]), month, Number(m[2])) : null
  }
  return null
}

type Calendar = { termOfMonth(month: number): number; sentence: string }

const QUARTERS: Calendar = {
  termOfMonth: (month) => Math.ceil(month / 3),
  sentence: 'January to March is term 1, April to June is term 2, July to September is term 3 and October to December is term 4.',
}

/**
 * The calendar of a school's country. The Long view counts calendar quarters for every school (see `termOf` in long-view.ts), so
 * South Africa's four terms and every other country use the same one for now, and the screen says so.
 */
export function termCalendar(country: string): Calendar {
  return country.toUpperCase() === 'ZA' || country.trim() === ''
    ? QUARTERS
    : { ...QUARTERS, sentence: `${QUARTERS.sentence} The Long view counts terms this way for every school, so your school's own terms may differ a little.` }
}

/** The term (1 to 4) of an ISO date in the school's country. */
export function termFromDate(isoDate: string, country: string): number {
  return termCalendar(country).termOfMonth(Number(isoDate.slice(5, 7)))
}

/** The first day of a term, for a row that has a term and a year but no date. */
export function termStart(year: number, term: number): string {
  return `${year}-${pad([1, 4, 7, 10][term - 1]!)}-01`
}

/** `1`, `T2`, `Term 3`. Null for anything else. */
export function parseTermText(text: string): number | null {
  const m = /^(?:term|t)?\s*([1-4])$/i.exec(text.trim())
  return m ? Number(m[1]) : null
}

/** `2025`, `Year 2024`, `2025/26` (the first year). Null for anything else. */
export function parseYear(text: string): number | null {
  const m = /\b((?:19|20)\d{2})\b/.exec(text)
  return m ? Number(m[1]) : null
}

/** `Grade 5`, `Gr 5`, `Gr5`, `5`: 1 to 12. */
export function parseGrade(text: string): number | null {
  const m = /^(?:grade|gr|g)?\s*(\d{1,2})$/i.exec(text.trim())
  const grade = m ? Number(m[1]) : null
  return grade !== null && grade >= 1 && grade <= 12 ? grade : null
}

/** What a kind column says, in words. Anything that is not a project or an assignment is a quiz. */
export function kindFromText(text: string): MarkedKind {
  if (/project/i.test(text)) return 'project'
  if (/assign|homework|home work|task|worksheet/i.test(text)) return 'assignment'
  return 'quiz'
}

// ---------------------------------------------------------------------------------------------------------------------
// Learners
// ---------------------------------------------------------------------------------------------------------------------

/** Lower case, no accents, letters and digits only, single spaces. */
export function plainText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export type LearnerMatch = { childId: string | null; options: string[] }

/**
 * Finds the learner a name in the file means, by first name inside the class (case and accents ignored). When two learners share the first
 * name, a surname or a surname letter after it breaks the tie ("Amina K", "Khan, Amina"). More than one left is `options`, none is empty.
 */
export function matchLearner(text: string, learners: ImportLearner[]): LearnerMatch {
  let written = text.trim()
  const comma = /^([^,]+),([^,]+)$/.exec(written)
  if (comma) written = `${comma[2]} ${comma[1]}`
  const tokens = plainText(written).split(' ').filter(Boolean)
  if (tokens.length === 0) return { childId: null, options: [] }
  const candidates = learners.flatMap((l) => {
    const first = plainText(l.firstName).split(' ').filter(Boolean)
    return first.length > 0 && first.every((t, i) => tokens[i] === t) ? [{ learner: l, rest: tokens.slice(first.length).join(' ') }] : []
  })
  if (candidates.length === 0) return { childId: null, options: [] }
  if (candidates.length === 1) return { childId: candidates[0]!.learner.id, options: [] }
  const rest = candidates[0]!.rest
  const narrowed = rest
    ? candidates.filter((c) => {
        const last = plainText(c.learner.lastName ?? '')
        return last !== '' && last.startsWith(rest)
      })
    : []
  if (narrowed.length === 1) return { childId: narrowed[0]!.learner.id, options: [] }
  return { childId: null, options: (narrowed.length > 1 ? narrowed : candidates).map((c) => c.learner.id) }
}

// ---------------------------------------------------------------------------------------------------------------------
// The mapping
// ---------------------------------------------------------------------------------------------------------------------

const same = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Checks the model's mapping against the file's header. A column is named the way the header spells it. A column the file does not have
 * is dropped and said in `warnings`. Throws `MappingError` when the file cannot be read at all: no learner column, nothing to record,
 * or one column given two meanings.
 */
export function checkMapping(raw: FileMapping, header: string[]): { mapping: FileMapping; warnings: string[] } {
  const byName = new Map<string, string>()
  for (const h of header) if (!byName.has(same(h))) byName.set(same(h), h)
  const warnings: string[] = []
  const mapping: FileMapping = { ...raw, fixed: { ...raw.fixed } }
  const used = new Map<string, ColumnField>()
  for (const field of COLUMN_FIELDS) {
    const asked = raw[field]
    if (asked === null || asked.trim() === '') {
      mapping[field] = null
      continue
    }
    const exact = byName.get(same(asked))
    if (!exact) {
      warnings.push(`The file has no column called "${asked}", so it was not used as the ${FIELD_WORDS[field]}.`)
      mapping[field] = null
      continue
    }
    const other = used.get(exact)
    if (other) throw new MappingError(`The column ${exact} cannot be both the ${FIELD_WORDS[other]} and the ${FIELD_WORDS[field]}.`)
    used.set(exact, field)
    mapping[field] = exact
  }
  if (!mapping.learner) throw new MappingError('The file needs a column that says who the learner is, and none of its columns does.')
  if (!mapping.mark && !mapping.percent && !mapping.note && !mapping.attendance) {
    throw new MappingError('The file needs a column with the mark, a note or attendance, and none of its columns has one.')
  }
  const seen = new Set<string>()
  mapping.topics = raw.topics.filter((t) => {
    const key = same(t.text)
    if (key === '' || seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { mapping, warnings }
}

const FIELD_WORDS: Record<ColumnField, string> = {
  learner: 'learner',
  mark: 'mark',
  outOf: 'total',
  percent: 'percent',
  date: 'date',
  term: 'term',
  year: 'year',
  grade: 'grade',
  subject: 'subject',
  title: 'title',
  kind: 'kind of piece',
  topic: 'topic',
  note: 'note',
  teacher: 'teacher',
  attendance: 'attendance',
}

const article = (kind: MarkedKind) => (kind === 'assignment' ? 'an assignment' : `a ${kind}`)

/** The mapping in plain words, one short sentence for each thing it says. */
export function describeMapping(m: FileMapping, _header: string[] = []): string[] {
  void _header
  const lines: string[] = []
  if (m.learner) lines.push(`The column ${m.learner} is the learner.`)
  if (m.mark) lines.push(`The column ${m.mark} is the mark.`)
  if (m.percent) lines.push(`The column ${m.percent} is the mark, as a percent.`)
  if (m.outOf) lines.push(`The column ${m.outOf} is what each result is out of.`)
  else if (m.fixed.outOf !== null && m.mark) lines.push(`Every result is out of ${m.fixed.outOf}.`)
  if (m.date) lines.push(m.term ? `The column ${m.date} is the date.` : `The column ${m.date} is the date. The term comes from the date.`)
  if (m.term) lines.push(`The column ${m.term} is the term.`)
  if (m.year) lines.push(`The column ${m.year} is the year.`)
  if (m.grade) lines.push(`The column ${m.grade} is the grade.`)
  if (m.subject) lines.push(`The column ${m.subject} is the subject.`)
  if (m.title) lines.push(`The column ${m.title} is the title of each piece of work.`)
  if (m.kind) lines.push(`The column ${m.kind} says if each piece is a quiz, an assignment or a project.`)
  else if (m.fixed.kind) lines.push(`Every row is ${article(m.fixed.kind)}.`)
  if (m.topic) lines.push(`The column ${m.topic} is the topic.`)
  if (m.note) lines.push(`The column ${m.note} is the teacher's note.`)
  if (m.teacher) lines.push(`The column ${m.teacher} is the teacher.`)
  else if (m.fixed.teacher) lines.push(`Every row is from ${m.fixed.teacher}.`)
  if (m.attendance) lines.push(`The column ${m.attendance} is attendance.`)
  if (!m.subject && m.fixed.subject) lines.push(`Every row is ${m.fixed.subject}.`)
  const when = [m.fixed.grade !== null && `Grade ${m.fixed.grade}`, m.fixed.term !== null && `Term ${m.fixed.term}`, m.fixed.year !== null && String(m.fixed.year)].filter(Boolean)
  if (when.length > 0) lines.push(`Every row is ${when.join(', ')}.`)
  return lines
}

// ---------------------------------------------------------------------------------------------------------------------
// Strands
// ---------------------------------------------------------------------------------------------------------------------

export type FamilyChoice = { family: string; label: string }

/** A short lowercase word with underscores (`Number Sense!` is `number_sense`). Null when nothing is left. */
export function tidyFamily(text: string): string | null {
  const word = plainText(text).replace(/ /g, '_').slice(0, 30).replace(/^_+|_+$/g, '')
  return word === '' ? null : word
}

/** A strand the class offers, or (when the class offers none) a tidied short word. Null when it is neither. */
export function pickFamily(family: string, families: FamilyChoice[] | null): string | null {
  if (families === null) return tidyFamily(family)
  const key = plainText(family)
  return families.find((f) => plainText(f.family) === key || plainText(f.label) === key)?.family ?? null
}

const stem = (word: string) => word.replace(/s$/, '')
const stemmed = (text: string) => ` ${plainText(text).split(' ').map(stem).join(' ')} `

/** The one strand whose name (its key or its label) is written in the topic. None, or more than one, is null. */
function strandByName(text: string, families: FamilyChoice[]): string | null {
  const haystack = stemmed(text)
  const hits = families.filter((f) => [f.family, f.label].some((name) => stemmed(name).trim() !== '' && haystack.includes(stemmed(name))))
  return hits.length === 1 ? hits[0]!.family : null
}

/**
 * The strand of a topic text. The model's answer for that text comes first (an answer of `unsure`, or one the class does not offer, does
 * not stand). A topic the model did not see is placed by a strand's name written in it. Otherwise null: Jemma is unsure.
 */
export function resolveFamily(text: string | null, topics: FileMapping['topics'], families: FamilyChoice[] | null): string | null {
  if (text === null || text.trim() === '') return null
  const key = same(text)
  const said = topics.find((t) => same(t.text) === key)
  if (said) {
    if (plainText(said.family) === 'unsure') return null
    const picked = pickFamily(said.family, families)
    if (picked) return picked
  }
  return families ? strandByName(text, families) : null
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading every row
// ---------------------------------------------------------------------------------------------------------------------

export type ReadContext = {
  learners: ImportLearner[]
  /** The class's subject, as written. */
  subject: string
  grade: number
  /** The year of the class. */
  year: number
  /** The school's country code. */
  country: string
  /** The strands a row can be placed in. Null: any short lowercase word. */
  families: FamilyChoice[] | null
}

const KIND_LABELS: Record<MarkedKind, string> = { quiz: 'Quiz', assignment: 'Assignment', project: 'Project' }
const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max).trimEnd() : text)

/**
 * Applies the mapping to every row of the table. Nothing is left out and nothing is guessed silently: a value the file does not give stays
 * null (the review screen flags it), and what was assumed is listed in `assumptions`.
 */
export function readRows(table: RawTable, mapping: FileMapping, ctx: ReadContext): { rows: ImportRow[]; assumptions: string[] } {
  const index = new Map<string, number>()
  table.header.forEach((h, i) => {
    if (!index.has(h)) index.set(h, i)
  })
  const cellOf = (row: RawRow, column: string | null): string => (column === null ? '' : (row.cells[index.get(column) ?? -1] ?? '').trim())
  const calendar = termCalendar(ctx.country)
  // Set while the rows are read, so they are kept on an object (a plain `let` is not tracked through the callback).
  const seen: { calendar: boolean; grade: { year: number; grade: number } | null } = { calendar: false, grade: null }

  const rows = table.rows.map((raw): ImportRow => {
    const learner = cellOf(raw, mapping.learner)
    const match = matchLearner(learner, ctx.learners)

    // The mark.
    const markCell = cellOf(raw, mapping.mark)
    const percentCell = cellOf(raw, mapping.percent)
    const fromPercentColumn = markCell === '' && percentCell !== ''
    const markText = markCell !== '' ? markCell : percentCell
    let marks: number | null = null
    let outOf: number | null = null
    let markProblem: ImportRow['markProblem'] = null
    if (markText !== '') {
      const parsed = parseMark(markText)
      if (!parsed.ok) markProblem = 'unreadable'
      else {
        // The total: the mark's own (14/20, 70%), else a percent column is out of 100, else the total column, else the file-wide total.
        const column = parseMark(cellOf(raw, mapping.outOf))
        const total = parsed.outOf ?? (fromPercentColumn ? 100 : null) ?? (column.ok ? column.marks : null) ?? mapping.fixed.outOf
        if (total === null || total <= 0) markProblem = 'no_total'
        else ({ marks, outOf } = wholeMarks(parsed.marks, total))
      }
    }

    // Attendance: present out of total, or a percent. Whole numbers.
    let present: number | null = null
    let total: number | null = null
    const attendance = mapping.attendance ? parseMark(cellOf(raw, mapping.attendance)) : null
    if (attendance?.ok && attendance.outOf !== null) {
      present = Math.round(attendance.marks)
      total = Math.round(attendance.outOf)
    }

    const note = cellOf(raw, mapping.note)
    const kindCell = cellOf(raw, mapping.kind)
    const marked: MarkedKind = kindCell !== '' ? kindFromText(kindCell) : (mapping.fixed.kind ?? 'quiz')
    const piece: PieceKind | null = markText !== '' ? marked : note !== '' ? 'note' : present !== null ? 'attendance' : null

    // When it happened.
    const date = parseDate(cellOf(raw, mapping.date))
    const termColumn = parseTermText(cellOf(raw, mapping.term))
    const year = date ? Number(date.slice(0, 4)) : (parseYear(cellOf(raw, mapping.year)) ?? mapping.fixed.year)
    const term = termColumn ?? (date ? termFromDate(date, ctx.country) : mapping.fixed.term)
    if (piece !== null && date && termColumn === null) seen.calendar = true
    const when = date ?? (year !== null && term !== null ? termStart(year, term) : null)

    let grade = parseGrade(cellOf(raw, mapping.grade)) ?? mapping.fixed.grade
    if (grade === null && piece !== null && year !== null) {
      grade = Math.min(12, Math.max(1, ctx.grade - (ctx.year - year)))
      seen.grade ??= { year, grade }
    }

    const topic = cellOf(raw, mapping.topic) || null
    const title = cellOf(raw, mapping.title)
    const strandText = topic ?? (title || null)
    const isMarked = piece !== null && (MARKED_KINDS as readonly string[]).includes(piece)
    const subjectCell = cellOf(raw, mapping.subject) || mapping.fixed.subject
    const label = piece === 'note' ? 'Teacher note' : piece === 'attendance' ? 'Attendance' : KIND_LABELS[marked]

    return {
      n: raw.n,
      cells: raw.cells.map((c) => clip(c, 200)),
      learner,
      childId: match.childId,
      options: match.options,
      piece,
      title: clip(title || topic || label, 120),
      subject: isMarked ? canonicalSubject(subjectCell || ctx.subject || DEFAULT_SUBJECT) : null,
      grade,
      year,
      term,
      date: when,
      marks,
      outOf,
      markText: clip(markText, 60),
      markProblem,
      topic: topic === null ? null : clip(topic, 120),
      strandText: strandText === null ? null : clip(strandText, 120),
      family: isMarked ? resolveFamily(strandText, mapping.topics, ctx.families) : null,
      text: note === '' ? null : clip(note, 1000),
      teacher: cellOf(raw, mapping.teacher) || mapping.fixed.teacher,
      present,
      total,
      skip: false,
      keep: false,
    }
  })

  const assumptions: string[] = []
  if (seen.calendar) assumptions.push(`Terms come from the dates. ${calendar.sentence}`)
  if (seen.grade) {
    assumptions.push(
      `The file does not give a grade for every row, so the grade was worked out from the year and the class (this class is Grade ${ctx.grade} in ${ctx.year}). For example, ${seen.grade.year} is Grade ${seen.grade.grade}.`,
    )
  }
  return { rows, assumptions }
}

// ---------------------------------------------------------------------------------------------------------------------
// Problems
// ---------------------------------------------------------------------------------------------------------------------

const isMarkedPiece = (piece: PieceKind | null): piece is MarkedKind => piece !== null && (MARKED_KINDS as readonly string[]).includes(piece)

/** Two records are the same piece when these are the same: the learner, the kind, the title, the day, the mark and the total. */
function sameKey(r: { childId: string; source: string; title: string; date: string; year: number; term: number; marks: number | null; outOf: number | null; text: string | null; present: number | null; total: number | null }): string {
  if (r.source === 'note') return `${r.childId}|note|${r.date}|${plainText(r.text ?? '')}`
  if (r.source === 'attendance') return `${r.childId}|attendance|${r.year}-${r.term}|${r.present}|${r.total}`
  return `${r.childId}|${r.source}|${plainText(r.title)}|${r.date}|${r.marks}|${r.outOf}`
}

/**
 * What is wrong with the rows as they stand. A row the teacher skipped has no problems. A repeat the teacher chose to keep has none.
 * Run it again after every fix.
 */
export function findProblems(rows: ImportRow[], c: { existing: ExistingRecord[]; families?: FamilyChoice[] | null }): Problem[] {
  const problems: Problem[] = []
  const had = new Map<string, number>()
  for (const e of c.existing) {
    had.set(sameKey({ childId: e.childId, source: e.source, title: e.title, date: e.happenedOn, year: e.year, term: e.term, marks: e.marks, outOf: e.outOf, text: e.text, present: e.present ?? null, total: e.total ?? null }), -1)
  }
  for (const r of rows) {
    if (r.piece === null || r.skip) continue
    const add = (kind: Problem['kind'], text: string) => problems.push({ row: r.n, kind, text: `Row ${r.n}: ${text}` })

    if (r.childId === null) {
      if (r.options.length > 1) add('two_learners', `${r.learner} could be ${r.options.length} different learners in this class.`)
      else add('unknown_learner', r.learner ? `${r.learner} is not a learner in this class.` : 'there is no learner name.')
    }
    if (r.markProblem === 'unreadable') add('bad_mark', `I cannot read the mark "${r.markText}".`)
    if (r.markProblem === 'no_total') add('no_total', `I cannot tell what ${r.markText} is out of.`)
    if (r.marks !== null && r.outOf !== null && r.marks > r.outOf) add('mark_above_total', `the mark ${r.markText} is above the total.`)
    if (r.date === null || r.term === null || r.year === null) add('no_term_or_date', 'there is no term or date.')
    if (isMarkedPiece(r.piece) && r.family === null) {
      add('topic_unsure', r.strandText ? `I am not sure which strand "${r.strandText}" belongs to.` : 'there is no topic to place in a strand.')
    }

    // A row that repeats a record the learner has, or an earlier row of the file. Only a row that can be placed can repeat.
    if (r.childId !== null && r.date !== null && r.year !== null && r.term !== null) {
      const key = sameKey({ childId: r.childId, source: r.piece, title: r.title, date: r.date, year: r.year, term: r.term, marks: r.marks, outOf: r.outOf, text: r.text, present: r.present, total: r.total })
      const earlier = had.get(key)
      if (earlier === undefined) had.set(key, r.n)
      else if (!r.keep) add('repeat', earlier === -1 ? `${r.learner || 'The learner'} already has this record.` : `the same as row ${earlier} of this file.`)
    }
  }
  return problems
}

export type Fix = { row: number; childId?: string; family?: string; skip?: boolean; keep?: boolean }

/**
 * One decision of the teacher, applied to a copy of the rows: pick the learner (one of the class), change the strand (for every row with
 * the same topic words), skip the row, or keep a repeat. A choice that is not allowed changes nothing.
 */
export function applyFix(rows: ImportRow[], fix: Fix, c: { learners: ImportLearner[]; families: FamilyChoice[] | null }): ImportRow[] {
  const target = rows.find((r) => r.n === fix.row)
  if (!target) return rows
  const family = fix.family === undefined ? undefined : pickFamily(fix.family, c.families)
  const group = target.strandText === null ? null : same(target.strandText)
  return rows.map((r) => {
    if (r.n === fix.row) {
      const next = { ...r }
      if (fix.childId !== undefined && c.learners.some((l) => l.id === fix.childId)) {
        next.childId = fix.childId
        next.options = []
      }
      if (family) next.family = family
      if (fix.skip !== undefined) next.skip = fix.skip
      if (fix.keep !== undefined) next.keep = fix.keep
      return next
    }
    if (family && group !== null && r.strandText !== null && same(r.strandText) === group && isMarkedPiece(r.piece)) return { ...r, family }
    return r
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// What gets written
// ---------------------------------------------------------------------------------------------------------------------

/** One `learner_records` row, without the ids the writer adds (school, learner, import, who added it). */
export type RecordDraft = {
  source: PieceKind
  grade: number
  year: number
  term: number
  happened_on: string
  teacher_name: string
  title: string
  subject: string | null
  family: string | null
  topic_name: string | null
  marks: number | null
  out_of: number | null
  text: string | null
  present: number | null
  total: number | null
  /** The row of the file it came from. */
  source_row: number
}

/** The records one row becomes: the marked piece (with its note), a note, and an attendance line. A row that is not complete writes nothing. */
export function recordDrafts(r: ImportRow): RecordDraft[] {
  if (r.piece === null || r.date === null || r.year === null || r.term === null || r.grade === null) return []
  const base = { grade: r.grade, year: r.year, term: r.term, happened_on: r.date, teacher_name: r.teacher ?? NO_TEACHER, source_row: r.n }
  const out: RecordDraft[] = []
  if (isMarkedPiece(r.piece)) {
    if (r.marks === null || r.outOf === null) return []
    out.push({ ...base, source: r.piece, title: r.title, subject: r.subject, family: r.family, topic_name: r.topic, marks: r.marks, out_of: r.outOf, text: r.text, present: null, total: null })
  } else if (r.piece === 'note') {
    out.push({ ...base, source: 'note', title: r.title, subject: null, family: null, topic_name: null, marks: null, out_of: null, text: r.text, present: null, total: null })
  }
  if (r.present !== null && r.total !== null) {
    out.push({ ...base, source: 'attendance', title: 'Attendance', subject: null, family: null, topic_name: null, marks: null, out_of: null, text: null, present: r.present, total: r.total })
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// One typed result
// ---------------------------------------------------------------------------------------------------------------------

/** What the "One result" form sends. Everything is as typed: the checks are here so the form and the server action say the same words. */
export type OneResultInput = {
  kind: unknown
  /** Empty means the class's subject. */
  subject?: string
  grade: unknown
  year: unknown
  term: unknown
  title?: string
  /** The strand. */
  family?: string
  marks?: unknown
  outOf?: unknown
  /** The note, for a note. */
  text?: string
  /** The teacher's name at the time. */
  teacherName?: string
}

export type OneResultContext = { subject: string; year: number; families: FamilyChoice[] | null }
export type OneResult = Omit<RecordDraft, 'source_row'>

const asInt = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value.trim().replace(',', '.')) : NaN
  return Number.isFinite(n) ? n : null
}

/**
 * Checks one typed result and returns the record to write. A note needs its text. A quiz, an assignment or a project needs a title, a
 * strand, the marks and what they are out of. Errors are one short sentence, in the order the form shows its fields.
 */
export function validateOneResult(input: OneResultInput, c: OneResultContext): { ok: true; value: OneResult } | { ok: false; error: string } {
  const kind = input.kind
  if (kind !== 'quiz' && kind !== 'assignment' && kind !== 'project' && kind !== 'note') return { ok: false, error: 'Pick what kind of piece this is' }
  const grade = asInt(input.grade)
  if (grade === null || !Number.isInteger(grade) || grade < 1 || grade > 12) return { ok: false, error: 'Pick a grade from 1 to 12' }
  const year = asInt(input.year)
  if (year === null || !Number.isInteger(year) || year < 1990) return { ok: false, error: 'Type the year it happened, for example 2025' }
  if (year > c.year) return { ok: false, error: `Past records are from ${c.year} or earlier` }
  const term = asInt(input.term)
  if (term === null || !Number.isInteger(term) || term < 1 || term > 4) return { ok: false, error: 'Pick a term from 1 to 4' }
  const teacher = (input.teacherName ?? '').trim().replace(/\s+/g, ' ')
  if (teacher === '') return { ok: false, error: "Type the teacher's name at the time" }
  if (teacher.length > 60) return { ok: false, error: "Keep the teacher's name under 60 letters" }
  const base = { grade, year, term, happened_on: termStart(year, term), teacher_name: teacher, present: null, total: null }

  if (kind === 'note') {
    const text = (input.text ?? '').trim()
    if (text === '') return { ok: false, error: 'Write the note' }
    if (text.length > 1000) return { ok: false, error: 'Keep the note under 1,000 letters' }
    const title = (input.title ?? '').trim()
    return { ok: true, value: { ...base, source: 'note', title: clip(title || 'Teacher note', 120), subject: null, family: null, topic_name: null, marks: null, out_of: null, text } }
  }

  const title = (input.title ?? '').trim().replace(/\s+/g, ' ')
  if (title === '') return { ok: false, error: 'Give the piece a title' }
  if (title.length > 120) return { ok: false, error: 'Keep the title under 120 letters' }
  const subject = canonicalSubject((input.subject ?? '').trim() || c.subject || DEFAULT_SUBJECT)
  const family = (input.family ?? '').trim() === '' ? null : pickFamily(input.family!, c.families)
  if (family === null) return { ok: false, error: (input.family ?? '').trim() === '' ? 'Pick the strand' : 'Pick one of the strands in the list' }
  const marks = asInt(input.marks)
  const outOf = asInt(input.outOf)
  if (marks === null || marks < 0) return { ok: false, error: 'Type the marks, for example 14' }
  if (outOf === null || outOf <= 0) return { ok: false, error: 'Type what the marks are out of, for example 20' }
  if (marks > outOf) return { ok: false, error: 'The marks cannot be more than the total' }
  const whole = wholeMarks(marks, outOf)
  return { ok: true, value: { ...base, source: kind, title, subject, family, topic_name: null, marks: whole.marks, out_of: whole.outOf, text: null } }
}

export type Counts = {
  /** Every row read, with the ones that had nothing to add. */
  rows: number
  /** Rows that will be added: no problem left, not skipped. */
  ready: number
  /** Rows with a problem that is still open. They are left out until the teacher fixes or skips them. */
  withProblems: number
  skipped: number
  /** Rows with nothing to add (no mark, no note, no attendance). */
  empty: number
  /** Records the ready rows write. */
  records: number
}

export function countRows(rows: ImportRow[], problems: Problem[]): Counts {
  const open = new Set(problems.map((p) => p.row))
  const live = rows.filter((r) => r.piece !== null && !r.skip)
  const ready = live.filter((r) => !open.has(r.n))
  return {
    rows: rows.length,
    ready: ready.length,
    withProblems: live.filter((r) => open.has(r.n)).length,
    skipped: rows.filter((r) => r.piece !== null && r.skip).length,
    empty: rows.filter((r) => r.piece === null).length,
    records: ready.reduce((n, r) => n + recordDrafts(r).length, 0),
  }
}
