import { LIST_ANSWER_KINDS, type ListKind } from '../../schemas/lesson'

/**
 * P150: the three answers that are several values. The key is the values in one text, cut at a semicolon (`3; 5; 7`: a comma is a decimal comma).
 *
 *   list    several values, in any order (all the factors of 24) or in a fixed order (the next three terms; a five-number summary with a label on each box)
 *   order   the learner puts the items of the question in order (fractions, decimals, numbers); the key is the right order
 *   table   a small table with some cells given and some empty; the key holds the values of the empty cells, left to right and top to bottom
 *
 * Every value is read by the one reader of numbers and expressions of `meaning.ts` (it is handed in as `read`, so this file needs nothing from there): the
 * same value is the same answer (`1/2`, `0,5`, `2/4`). `round` says the question asks for a rounded answer ("correct to 1 decimal place"): the key is
 * compared rounded to that many places. This file is pure: no database, no model, no browser.
 * P199: a table of outcomes (the "Probability" board: "A coin is tossed and a die is rolled. Fill in the table.") has outcomes in its cells, like H4 (heads and
 * a 4) or HT: when every value of its key is an outcome, they are compared as letters and digits, not read as numbers.
 */

export const isListKind = (kind: string): kind is ListKind => (LIST_ANSWER_KINDS as readonly string[]).includes(kind)

/** The longest key or typed answer of these kinds (a 4 by 6 table of short numbers fits). The other kinds keep their 60. */
export const LIST_MAX_LENGTH = 240
export const LIST_MIN_VALUES = 2
export const LIST_MAX_VALUES = 10
export const ORDER_MAX_ITEMS = 8
export const TABLE_MAX_COLUMNS = 4
export const TABLE_MAX_ROWS = 6
/** The longest label over a box, and the most places a question may ask a rounding to (the same 6 as P148). */
export const LABEL_MAX_LENGTH = 24
export const ROUND_MAX = 6

export type Table = { columns: string[]; rows: (string | null)[][] }
export type ListOptions = { ordered?: boolean; round?: number }
/** What the three kinds need of a question: its key and its kind, and the optional fields that go with them. */
export type ListQuestion = { prompt?: string; answer: string; answerKind: string; ordered?: boolean; labels?: string[]; round?: number; table?: Table }
/** The reader of one value: a number, or null when the text is not one. */
export type Reader = (text: string) => number | null

/**
 * Numbers with only spaces between them ("3 5 7": a list written on paper without its semicolons). A mixed number ("1 1/2") is one value, so two words that are a
 * whole number and a fraction stay together; "1 1/2 3/4" is read as three values (it cannot be told from three).
 */
const spaced = (t: string): string[] | null => {
  const words = t.trim().split(/\s+/)
  if (words.length < 2 || !words.every((w) => /^-?[\d.,/]+$/.test(w))) return null
  // A space between the thousands ("1 250") is one number, as everywhere else.
  if (/^-?\d{1,3}( \d{3})+([.,]\d+)?$/.test(t.trim())) return null
  return words.length === 2 && /^\d+$/.test(words[0]!) && /^\d+\/\d+$/.test(words[1]!) ? null : words
}

/** The values of a text: cut at a semicolon or a new line, or (a list written on paper) at a comma with a space after it, or at spaces between numbers. Interior empties stay (they are wrong cells); trailing ones go. */
export function splitValues(text: string): string[] {
  const t = text.replace(/\r?\n/g, ';')
  const parts = t.includes(';') ? t.split(';') : /,\s/.test(t) ? t.split(/,\s+/) : (spaced(t) ?? [t])
  const cells = parts.map((p) => p.trim())
  while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
  return cells
}

/** `v` rounded to `places` decimal places, halves away from zero (1.005 to 2 places is 1.01, as on paper). */
export function roundTo(v: number, places: number): number {
  const f = 10 ** places
  const sign = v < 0 ? -1 : 1
  return (sign * Math.round(Math.abs(v) * f * (1 + 1e-12))) / f
}

/** Two values are the same when they differ by less than a billionth of their size (and of 1), as in `meaning.ts`. */
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

/** `v` rounded half away from zero at `places` places, as a whole number of the last place (3,145 at 2 places is 315). A hair is added against 3,135 being held as 3,13499999. */
const scaled = (v: number, places: number): number => {
  const whole = Math.floor(Math.abs(v) * 10 ** places + 0.5 + 1e-9)
  return v < 0 ? -whole : whole
}

/**
 * The rule of `round` (the same as P148's `quantity.ts`): a typed value is right when it is the key's value, or rounds to the key's value at that many places
 * ("correct to 1 decimal place": 3,14 and 3,1 are right for 3,14159, 3,2 is not).
 */
const sameValue = (typed: number, key: number, round: number | undefined): boolean =>
  close(typed, key) || (round !== undefined && scaled(typed, round) === scaled(key, round))

/** `cells[i]` is whether value i is right: its place for a fixed order, its turn for any order. Right as a whole when every cell is and the count is the key's. */
export type ValuesMark = { correct: boolean; comparable: boolean; cells: boolean[] }
const UNREAD: ValuesMark = { correct: false, comparable: false, cells: [] }

/** The values of a key, read, or null when the key is empty or a value does not read. */
function keyValues(key: string, read: Reader): number[] | null {
  const texts = splitValues(key)
  if (texts.length === 0) return null
  const values = texts.map(read)
  return values.every((v): v is number => v !== null && Number.isFinite(v)) ? values : null
}

/**
 * Marks the values of `answer` against the values of `key`. A fixed order compares place by place; any order matches each typed value with a key value
 * not used yet. `round` compares the key rounded to that many places. A key that does not read, or an answer with a value that does not, is not comparable (and not right).
 */
export function markValues(key: string, answer: string, options: ListOptions, read: Reader): ValuesMark {
  const keyed = keyValues(key, read)
  if (!keyed) return UNREAD
  const same = (typed: number, key: number) => sameValue(typed, key, options.round)
  const typed = splitValues(answer).map((t) => {
    const v = read(t)
    return v !== null && Number.isFinite(v) ? v : null
  })
  if (typed.length === 0 || typed.some((v) => v === null)) {
    // An answer that does not read: right nowhere. The cells still say which values were fine, for the results.
    return { correct: false, comparable: false, cells: placeCells(keyed, typed, options.ordered === true, same) }
  }
  const cells = placeCells(keyed, typed, options.ordered === true, same)
  return { correct: typed.length === keyed.length && cells.every(Boolean), comparable: true, cells }
}

function placeCells(want: number[], typed: (number | null)[], ordered: boolean, same: (typed: number, key: number) => boolean): boolean[] {
  if (ordered) {
    return Array.from({ length: Math.max(want.length, typed.length) }, (_, i) => {
      const v = typed[i]
      return v !== null && v !== undefined && i < want.length && same(v, want[i]!)
    })
  }
  const unused = [...want]
  const cells = typed.map((v) => {
    if (v === null) return false
    const at = unused.findIndex((w) => same(v, w))
    if (at < 0) return false
    unused.splice(at, 1)
    return true
  })
  // A key value nobody typed is a place that is wrong too, so a short answer shows it.
  while (cells.length < want.length) cells.push(false)
  return cells
}

/** `ordered` as the question means it: a label on each box fixes the place of each value, so labels win over the flag. */
export const isOrdered = (q: Pick<ListQuestion, 'ordered' | 'labels' | 'answerKind'>): boolean =>
  q.answerKind !== 'list' || q.ordered === true || (q.labels?.length ?? 0) > 0

export const listOptions = (q: Pick<ListQuestion, 'ordered' | 'labels' | 'answerKind' | 'round'>): ListOptions => ({
  ordered: isOrdered(q),
  ...(q.round !== undefined ? { round: q.round } : {}),
})

/** P199: an outcome of a table of outcomes: 1 to 4 letters and digits with a letter in it (H4, HT, R2, GB). */
const OUTCOME = /^(?=.*[A-Z])[A-Z0-9]{1,4}$/
/** An outcome as it is compared: in capitals, with no spaces, commas, dashes or brackets (`h, 4` is H4). The order of its letters stays: HT is not TH. */
export const outcomeOf = (t: string): string => t.replace(/[\s,()\-\u2212]/g, '').toUpperCase()
export const isOutcome = (t: string): boolean => OUTCOME.test(outcomeOf(t))
/** An outcome as a key writes it: in capitals as it is (H4), so algebra in a table (2x) is never taken for one. */
const keyOutcome = (t: string): boolean => OUTCOME.test(t.replace(/\s/g, ''))
/** P199: a table of outcomes: a table question whose every key value is an outcome. */
export const isOutcomeTable = (q: Pick<ListQuestion, 'answer' | 'answerKind'>): boolean => {
  if (q.answerKind !== 'table') return false
  const texts = splitValues(q.answer)
  return texts.length > 0 && texts.every(keyOutcome)
}

/** The blanks of a table in reading order: the row and the column of each. */
const blanksOf = (t: Table): { r: number; c: number }[] => t.rows.flatMap((row, r) => row.flatMap((cell, c) => (cell === null ? [{ r, c }] : [])))

/**
 * P199: the outcome a blank of a table of outcomes holds, in either order: its column heading and the first cell of its row put together (H and 4: H4 or 4H). The
 * place of the blank says which outcome it is, so the two parts may be written either way round.
 */
const sameOutcome = (typed: string, want: string, t: Table | undefined, at: { r: number; c: number } | undefined): boolean => {
  if (typed === want) return true
  if (!t || !at) return false
  const a = outcomeOf(t.columns[at.c] ?? '')
  const b = outcomeOf(t.rows[at.r]?.[0] ?? '')
  return (want === a + b || want === b + a) && (typed === a + b || typed === b + a)
}

/** P199: the cells of a table of outcomes marked place by place; an answer with a value that is no outcome is not comparable. */
function markOutcomes(key: string, answer: string, table?: Table): ValuesMark {
  const want = splitValues(key).map(outcomeOf)
  const typed = splitValues(answer).map(outcomeOf)
  const blanks = table ? blanksOf(table) : []
  const cells = Array.from({ length: Math.max(want.length, typed.length) }, (_, i) => i < want.length && typed[i] !== undefined && sameOutcome(typed[i]!, want[i]!, table, blanks[i]))
  const comparable = typed.length > 0 && typed.every((t) => OUTCOME.test(t))
  return { correct: comparable && typed.length === want.length && cells.every(Boolean), comparable, cells }
}

/** Marks a typed answer of a list, an order or a table question. P199: a table of outcomes by its outcomes. */
export const markListQuestion = (q: ListQuestion, answer: string, read: Reader): ValuesMark =>
  isOutcomeTable(q) ? markOutcomes(q.answer, answer, q.table) : markValues(q.answer, answer, listOptions(q), read)

// ---- The save gate: can the key be marked? --------------------------------------------------------------------------------------

const tableProblem = (t: Table | undefined, count: number): string | null => {
  if (!t) return 'a table question needs a table'
  if (t.columns.length < 1 || t.columns.length > TABLE_MAX_COLUMNS) return `a table has at most ${TABLE_MAX_COLUMNS} columns (and at least 1)`
  if (t.rows.length < 1 || t.rows.length > TABLE_MAX_ROWS) return `a table has at most ${TABLE_MAX_ROWS} rows (and at least 1)`
  if (t.rows.some((row) => row.length !== t.columns.length)) return 'every row of a table needs one cell for each of its columns'
  if (t.columns.some((c) => c.trim() === '')) return 'a column of a table needs a heading'
  if (t.rows.some((row) => row.some((cell) => cell !== null && cell.trim() === ''))) return 'a given cell of a table is empty: write null for a blank'
  const blanks = t.rows.flat().filter((cell) => cell === null).length
  if (blanks === 0) return 'a table needs at least one blank cell for the learner to fill'
  if (blanks !== count) return `the key has ${count} values for ${blanks} blank cells: one value for each, left to right, top to bottom`
  return null
}

/**
 * P199: why the key of a table of outcomes is not its outcomes, or null: the first column gives one part of each outcome (the die: 1 to 6), the other headings the
 * other part (H, T), and each blank holds its column and its row put together (H4), in either order.
 */
function outcomeKeyProblem(t: Table, texts: string[]): string | null {
  const blanks = blanksOf(t)
  for (let k = 0; k < blanks.length; k++) {
    const { r, c } = blanks[k]!
    if (c === 0) return 'a table of outcomes gives the first part of each outcome in its first column (like the die: 1 to 6), with no blank there'
    const a = outcomeOf(t.columns[c]!)
    const b = outcomeOf(t.rows[r]![0] ?? '')
    const got = outcomeOf(texts[k]!)
    if (got !== a + b && got !== b + a)
      return `the blank in row ${r + 1} under ${t.columns[c]!.trim()} is ${t.columns[c]!.trim()} and ${(t.rows[r]![0] ?? '').trim()} put together (${a + b}), not ${texts[k]!.trim()}: the key goes left to right, then top to bottom`
  }
  return null
}

/** Why the key of a list, an order or a table cannot be marked, or null when it can (the save gate asks this of every key of these kinds). */
export function listKeyProblem(q: ListQuestion, read: Reader): string | null {
  if (q.round !== undefined && !(Number.isInteger(q.round) && q.round >= 0 && q.round <= ROUND_MAX)) return `round must be a whole number from 0 to ${ROUND_MAX}`
  if (q.answer.length > LIST_MAX_LENGTH) return `answer is longer than ${LIST_MAX_LENGTH} characters`
  const texts = splitValues(q.answer)
  // P199: a table of outcomes holds outcomes (H4), not numbers, each its column and its row put together.
  if (isOutcomeTable(q)) return tableProblem(q.table, texts.length) ?? outcomeKeyProblem(q.table!, texts)
  for (const t of texts) {
    const v = read(t)
    if (v === null || !Number.isFinite(v)) return `answer value "${t}" is not a number${q.answerKind === 'table' ? ' (a table of outcomes has an outcome like H4 in every blank)' : ''}`
  }
  if (q.answerKind === 'table') return tableProblem(q.table, texts.length)
  if (texts.length < LIST_MIN_VALUES) return `a ${q.answerKind} needs at least ${LIST_MIN_VALUES} values, written with a semicolon between them`
  const most = q.answerKind === 'order' ? ORDER_MAX_ITEMS : LIST_MAX_VALUES
  if (texts.length > most) return `a ${q.answerKind} has at most ${most} values`
  if (q.answerKind === 'list' && q.labels) {
    const fine = q.labels.length === texts.length && q.labels.every((l) => l.trim() !== '' && l.trim().length <= LABEL_MAX_LENGTH)
    if (!fine) return `a list needs one label for each value, not empty and up to ${LABEL_MAX_LENGTH} letters: ${texts.length} labels`
  }
  return null
}

// ---- What the learner's screen is told (never a value of the key) ------------------------------------------------------------------

/** A value a number pad is enough for: digits with a decimal comma or point, no sign, no fraction. */
const PLAIN_VALUE = /^\d+([.,]\d+)?$/

/** The same shuffle every time for the same question (a number from the words of its prompt), so a screen that is shown again shows the same chips. */
function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The items in an order that is never the key's (so the chips never start in the right order), the same one for the same `seed`. */
export function shuffledItems(items: string[], seed: string): string[] {
  const next = mulberry32(seedOf(seed))
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  const same = out.every((v, i) => v === items[i])
  // Only a list whose items are all the same text has no other order; the rest are turned one place.
  return same && items.length > 1 && new Set(items).size > 1 ? [...out.slice(1), out[0]!] : out
}

export type ListParts = {
  /** The boxes of a list: how many, whether the place of a value matters, whether a number pad is enough, and a label for each box. */
  list?: { count: number; ordered: boolean; plain: boolean; labels?: string[] }
  /** The chips of an order question, shuffled. */
  items?: string[]
  /** The table: its given cells are in the question anyway; a blank is null. P199: `outcomes` when its blanks take outcomes (H4), not numbers. */
  table?: { columns: string[]; rows: (string | null)[][]; plain: boolean; outcomes?: boolean }
}

/** What the browser may know of a list, an order or a table question: counts, labels, the given cells and the items; never a value of the key. */
export function listAnswerParts(q: ListQuestion): ListParts {
  if (!isListKind(q.answerKind)) return {}
  const texts = splitValues(q.answer)
  const plain = texts.length > 0 && texts.every((t) => PLAIN_VALUE.test(t))
  if (q.answerKind === 'list') {
    const labelled = q.labels && q.labels.length === texts.length
    return { list: { count: texts.length, ordered: isOrdered(q), plain, ...(labelled ? { labels: q.labels } : {}) } }
  }
  if (q.answerKind === 'order') return { items: shuffledItems(texts, `${q.prompt ?? ''}|${texts.length}`) }
  return q.table ? { table: { columns: q.table.columns, rows: q.table.rows, plain, ...(isOutcomeTable(q) ? { outcomes: true } : {}) } } : {}
}

/**
 * The key as the question asks for it: each value rounded to `round` places and written with the key's own decimal sign (a comma when the key has one, else a point,
 * else a comma), or the key as it is when the question asks for no rounding or a value does not read. This is what the results show as the right answer.
 */
export function rightValues(q: Pick<ListQuestion, 'answer' | 'round'>, read: Reader): string[] {
  const texts = splitValues(q.answer)
  if (q.round === undefined) return texts
  const sign = q.answer.includes(',') ? ',' : q.answer.includes('.') ? '.' : ','
  return texts.map((t) => {
    const v = read(t)
    return v === null || !Number.isFinite(v) ? t : roundTo(v, q.round!).toFixed(q.round).replace('.', sign)
  })
}

/** The cells of a typed answer for the results: what was written in each place, and whether it was right. `right` is the key's value for that place. */
export function resultCells(q: ListQuestion, stored: string, read: Reader): { wrote: string; right: string; ok: boolean }[] {
  const keyTexts = rightValues(q, read)
  const wrote = splitValues(stored)
  const mark = markListQuestion(q, stored, read)
  const length = Math.max(keyTexts.length, wrote.length)
  const ordered = listOptions(q).ordered === true
  return Array.from({ length }, (_, i) => ({
    wrote: wrote[i] ?? '',
    // For any order a place has no key value of its own: the right answer is the whole list, shown once.
    right: ordered ? (keyTexts[i] ?? '') : '',
    ok: mark.cells[i] === true,
  }))
}
