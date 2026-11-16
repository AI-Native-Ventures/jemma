import { PRIMARY_ANSWER_KINDS, type Choice, type Question, type SeniorDiagramSpec, type TeachingBlock, type TeachingLesson, type TeachingSource } from '@jemma/profiling/schemas'
import { markQuestion, pictureProblem } from '@jemma/profiling/logic'
import { answerProblem } from '../../packages/profiling/src/tools/save/save-lesson'
import { CAPS_CREDIT } from './sources'

/**
 * Every check of a lesson that code can do, with no model and no network. An empty list is a pass; each problem is one plain sentence that says
 * where it is ("block 4 (worked)", "practice 3") and what is wrong, and is handed back to the writer on a rewrite.
 */

export type CheckContext = { grade: number; source: TeachingSource }

const EM_DASH = String.fromCharCode(0x2014)
/** What a voice cannot say: a backslash, a caret, a subscript brace, a dollar sign. */
const SPEECH_BAD = /[\\^$]|_\{/
/** LaTeX in a line the learner reads: a dollar sign, or a backslash and a command or bracket. */
export const LATEX = /\$|\\[A-Za-z()[\]{}]/
const NUMERIC_KINDS = new Set(['whole', 'decimal', 'fraction', 'mixed', 'money', 'number'])

export const WORKED_MIN = (grade: number) => (grade <= 3 ? 2 : 3)

// ---- plain arithmetic ----------------------------------------------------------------------------------------------------------------

/** A line made only of digits, brackets, + - times divide and powers: the one kind of step code can re-calculate with no doubt. */
const ARITHMETIC = /^[\d\s+\-−×÷*/().,^]+$/

/** The value of plain arithmetic (numbers, + - x / brackets, ^), or null when the text is anything else or does not work out (a division by zero). */
export function evalArithmetic(text: string): number | null {
  const src = text.replace(/−/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/')
  const tokens = src.match(/\d+(?:[.,]\d+)?|[+\-*/^()]|\S/g)
  if (!tokens) return null
  let at = 0
  const peek = () => tokens[at]
  const fail = Symbol('fail')
  const expr = (): number => {
    let v = term()
    while (peek() === '+' || peek() === '-') v = tokens[at++] === '+' ? v + term() : v - term()
    return v
  }
  const term = (): number => {
    let v = unary()
    while (peek() === '*' || peek() === '/') {
      const op = tokens[at++]
      const r = unary()
      if (op === '/' && r === 0) throw fail
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  const unary = (): number => {
    if (peek() === '-') {
      at++
      return -unary()
    }
    return power()
  }
  const power = (): number => {
    const base = atom()
    if (peek() === '^') {
      at++
      return Math.pow(base, unary())
    }
    return base
  }
  const atom = (): number => {
    const t = tokens[at++]
    if (t === undefined) throw fail
    if (t === '(') {
      const v = expr()
      if (tokens[at++] !== ')') throw fail
      return v
    }
    if (/^\d/.test(t)) return Number(t.replace(',', '.'))
    throw fail
  }
  try {
    const v = expr()
    return at === tokens.length && Number.isFinite(v) ? v : null
  } catch (e) {
    if (e === fail) return null
    throw e
  }
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

/** `value` is `shown` rounded to the decimals `shown` is written with (3,33 is 10/3 rounded to 2 places). */
const roundsTo = (value: number, shown: string, shownValue: number) => {
  const places = /[.,](\d+)\s*$/.exec(shown)?.[1]?.length
  return places !== undefined && Math.abs(value - shownValue) <= 0.5 * Math.pow(10, -places) + 1e-9
}

/** Lines of the form `a = b` (or `a = b = c`) where both sides are plain arithmetic and they are not the same number. */
function untrueSteps(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    if (line.includes('≈')) continue
    const parts = line.split('=').map((p) => p.trim())
    for (let i = 0; i + 1 < parts.length; i++) {
      const a = parts[i]!
      const b = parts[i + 1]!
      if (!ARITHMETIC.test(a) || !ARITHMETIC.test(b)) continue
      const va = evalArithmetic(a)
      const vb = evalArithmetic(b)
      if (va === null || vb === null) continue
      if (close(va, vb) || roundsTo(va, b, vb) || roundsTo(vb, a, va)) continue
      out.push(`the step "${line.trim()}" is not true: ${a} is ${Number(va.toFixed(6))}, not ${Number(vb.toFixed(6))}`)
      break
    }
  }
  return out
}

// ---- the end of a working shows the answer ------------------------------------------------------------------------------------------

const squash = (s: string) => s.replace(/\s+/g, '').replace(/−/g, '-').replace(/degrees?/gi, '°').toLowerCase()

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Does the last line of a working show this answer? What follows its last equals sign is read as the kind of the answer and compared by value
 * (so `x = -3` is not the answer 3, and 120 is not 12). Only when that cannot be read (a unit or a word after the number) does the answer have
 * to stand in the line as a whole token.
 */
function endsWithAnswer(lastLine: string, answer: string, kind: string): boolean {
  const afterEquals = (lastLine.split('=').pop() ?? lastLine).trim()
  try {
    const mark = markQuestion({ answer, answerKind: kind }, afterEquals)
    if (mark.comparable) return mark.correct
  } catch {
    // not readable: fall through to the token test
  }
  const token = escapeRegExp(squash(answer))
  // The answer must stand on its own: not inside a longer number (120, 11/2, -3), but a full stop after it is only the end of a sentence.
  return new RegExp(`(?<![\\d/^-])(?<!\\d[.,])${token}(?![\\d/^])(?![.,]\\d)`).test(squash(lastLine))
}

// ---- pictures ------------------------------------------------------------------------------------------------------------------------

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)

/** Why a picture makes no sense, or null. The seven primary pictures are checked here; the two senior ones by `pictureProblem`. */
export function diagramProblem(spec: SeniorDiagramSpec, grade: number): string | null {
  if (grade <= 6 && (spec.kind === 'coordinate_plane' || spec.kind === 'triangle')) return `Grades 1 to 6 draw only the seven primary pictures, not a ${spec.kind.replace('_', ' ')}`
  switch (spec.kind) {
    case 'fraction_bar': {
      if (spec.rows.length === 0) return 'the fraction bar has no rows'
      for (const r of spec.rows) {
        if (!isInt(r.parts) || r.parts < 1 || r.parts > 24) return `a fraction bar needs a whole number of parts from 1 to 24 (it has ${r.parts})`
        if (!isInt(r.shaded) || r.shaded < 0 || r.shaded > r.parts) return `a fraction bar has shaded ${r.shaded} of ${r.parts} parts: shaded can never be more than the parts`
      }
      return null
    }
    case 'area_model': {
      if (!isInt(spec.rows) || !isInt(spec.cols) || spec.rows < 1 || spec.cols < 1 || spec.rows > 30 || spec.cols > 30) return 'an area model needs whole rows and columns from 1 to 30'
      if (!isInt(spec.shaded) || spec.shaded < 0 || spec.shaded > spec.rows * spec.cols) return `an area model has shaded ${spec.shaded} of ${spec.rows * spec.cols} cells: shaded can never be more than the cells`
      return null
    }
    case 'grid_area': {
      if (!isInt(spec.rows) || !isInt(spec.cols) || spec.rows < 1 || spec.cols < 1 || spec.rows > 40 || spec.cols > 40) return 'a grid needs whole rows and columns from 1 to 40'
      const outside = spec.cells.find(([c, r]) => !isInt(c) || !isInt(r) || c < 0 || r < 0 || c >= spec.cols || r >= spec.rows)
      return outside ? `the grid cell [${outside.join(', ')}] is outside the grid: cells are [column, row] counted from 0` : null
    }
    case 'number_line': {
      if (![spec.min, spec.max, spec.step].every(Number.isFinite) || !(spec.min < spec.max) || !(spec.step > 0)) return 'a number line needs min below max and a step above 0'
      if ((spec.max - spec.min) / spec.step > 200) return 'a number line has too many steps: use a bigger step'
      const off = spec.marks.find((m) => !Number.isFinite(m.value) || m.value < spec.min || m.value > spec.max)
      return off ? `the number line mark ${off.value} is outside ${spec.min} to ${spec.max}` : null
    }
    case 'bar_chart': {
      if (spec.bars.length === 0 || !(spec.yMax > 0)) return 'a bar chart needs bars and a yMax above 0'
      const off = spec.bars.find((b) => !Number.isFinite(b.value) || b.value < 0 || b.value > spec.yMax)
      return off ? `the bar chart bar "${off.label}" has value ${off.value}, outside 0 to ${spec.yMax}` : null
    }
    case 'place_value':
      return spec.columns.length === 0 || spec.columns.length !== spec.digits.length ? 'a place value chart needs the same number of columns and digits (at least one)' : null
    case 'shape_2d':
      return null
    default:
      return pictureProblem(spec)
  }
}

// ---- the lesson ------------------------------------------------------------------------------------------------------------------------

type Ctx = CheckContext

/** A choice is plain text, or (since the screens learned pictures) an object with text and a picture: either way two options must differ. */
const choiceKey = (c: Choice): string => (typeof c === 'string' ? c.trim() : JSON.stringify(c))

function questionProblems(q: Question, where: string, ctx: Ctx): string[] {
  const out: string[] = []
  const add = (msg: string) => out.push(`${where}: ${msg}`)
  const key = answerProblem(q)
  if (key) add(key)
  if (ctx.grade <= 6 && !(PRIMARY_ANSWER_KINDS as readonly string[]).includes(q.answerKind)) add(`Grades 1 to 6 use only the answer kinds ${PRIMARY_ANSWER_KINDS.join(', ')} (not ${q.answerKind})`)
  if (q.answerKind === 'choice') {
    const n = q.choices?.length ?? 0
    if (n < 3 || n > 5 || new Set(q.choices?.map(choiceKey)).size !== n) add('a choice question needs 3 or 4 different options in `choices`')
    else if (!/^[A-Z]$/.test(q.answer.trim().toUpperCase()) || q.answer.trim().toUpperCase().charCodeAt(0) - 65 >= n) add(`the answer letter "${q.answer}" does not point at one of the ${n} options`)
  }
  const steps = q.steps ?? []
  if (steps.length < 2 || steps.length > 6) add(`it needs 2 to 6 working lines in \`steps\` (it has ${steps.length})`)
  else {
    if (NUMERIC_KINDS.has(q.answerKind) && !key && !endsWithAnswer(steps[steps.length - 1]!, q.answer, q.answerKind)) add(`the last working line "${steps[steps.length - 1]}" does not show the answer ${q.answer}`)
    for (const bad of untrueSteps(steps)) add(bad)
  }
  if (q.diagram) {
    const d = diagramProblem(q.diagram, ctx.grade)
    if (d) add(`picture: ${d}`)
  }
  return out
}

// ---- a try block must not give its answer away ------------------------------------------------------------------------------------------

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/** A whole number from 0 to 999 as the words a voice says (with and without "and" after hundred), or none for anything else. */
export function numberWords(n: number): string[] {
  if (!Number.isInteger(n) || n < 0 || n > 999) return []
  if (n < 20) return [ONES[n]!]
  if (n < 100) return [`${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`, `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`]
  const rest = n % 100
  const head = `${ONES[Math.floor(n / 100)]} hundred`
  return rest === 0 ? [head] : numberWords(rest).flatMap((w) => [`${head} and ${w}`, `${head} ${w}`])
}

const standsAlone = (token: string, text: string): boolean => new RegExp(`(?<![\\d/^-])(?<!\\d[.,])${escapeRegExp(token)}(?![\\d/^])(?![.,]\\d)`).test(text)
const wordIn = (phrase: string, text: string): boolean => new RegExp(`(?<![a-z])${escapeRegExp(phrase)}(?![a-z])`).test(text)
const optionText = (c: Choice): string => (typeof c === 'string' ? c : (c.text ?? ''))

/**
 * Does `hint` or `speech` of a `try` block tell the learner the answer? Both reach the browser before the learner answers. The answer as written, a
 * whole number as words ("twelve"), the letter of the right option ("the answer is B") and the text of the right option all count. A value that is
 * already in the question is not a leak: the learner can read it there.
 */
export function answerLeak(q: Question, text: string): string | null {
  const flat = squash(text)
  const prompt = squash(q.prompt)
  const lower = text.toLowerCase()
  if (q.answerKind === 'choice') {
    const index = q.answer.trim().toUpperCase().charCodeAt(0) - 65
    const letter = q.answer.trim().toUpperCase()
    if (/^[A-E]$/.test(letter) && new RegExp(`\\b(answer|correct|right|choose|pick|select|option)\\b[^.?!]{0,30}\\b${letter}\\b`, 'i').test(text)) return letter
    const right = squash(optionText((q.choices ?? [])[index] ?? ''))
    if (right.length >= 2 && flat.includes(right)) return optionText((q.choices ?? [])[index] ?? '')
    return null
  }
  const answer = squash(q.answer)
  if (!answer) return null
  if (standsAlone(answer, prompt)) return null
  if (standsAlone(answer, flat)) return q.answer
  const n = /^-?\d+$/.test(answer) ? Number(answer) : NaN
  if (Number.isInteger(n) && n >= 0) for (const words of numberWords(n)) if (wordIn(words, lower)) return words
  return null
}

function blockProblems(b: TeachingBlock, n: number, ctx: Ctx): string[] {
  const where = `block ${n} (${b.kind})`
  const out: string[] = []
  const add = (msg: string) => out.push(`${where}: ${msg}`)
  if (b.kind === 'worked') {
    if (b.answerKind !== 'choice') {
      const key = answerProblem({ prompt: '', render: 'text', answer: b.answer, answerKind: b.answerKind, difficulty: 1, why: '', rightWay: '' })
      if (key) add(key)
      else if (NUMERIC_KINDS.has(b.answerKind)) {
        const last = b.steps[b.steps.length - 1]!.line
        if (!endsWithAnswer(last, b.answer, b.answerKind)) add(`the last step "${last}" does not show the answer ${b.answer}`)
      }
    }
    for (const bad of untrueSteps(b.steps.map((s) => s.line))) add(bad)
    if (b.diagram) {
      const d = diagramProblem(b.diagram, ctx.grade)
      if (d) add(`picture: ${d}`)
    }
  }
  if (b.kind === 'diagram') {
    const d = diagramProblem(b.spec, ctx.grade)
    if (d) add(`picture: ${d}`)
  }
  if (b.kind === 'mistake' && b.diagram) {
    const d = diagramProblem(b.diagram, ctx.grade)
    if (d) add(`picture: ${d}`)
  }
  if (b.kind === 'try') {
    out.push(...questionProblems(b.question, where, ctx))
    for (const field of ['hint', 'speech'] as const) {
      const leak = answerLeak(b.question, b[field])
      if (leak) add(`the ${field} gives the answer away ("${leak}"): it reaches the learner before they answer, so it must help without giving the answer`)
    }
  }
  return out
}

/** Every string of a value with the name of the field it is in. */
function* strings(value: unknown, field = ''): Generator<[string, string]> {
  if (typeof value === 'string') yield [field, value]
  else if (Array.isArray(value)) for (const v of value) yield* strings(v, field)
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* strings(v, k)
}

function textProblems(value: unknown, where: string): string[] {
  const out = new Set<string>()
  for (const [field, text] of strings(value)) {
    if (field === 'speech') {
      if (SPEECH_BAD.test(text)) out.add(`${where}: the speech holds a symbol a voice cannot say (a backslash, ^, _{ or $): say the maths in words`)
    } else if (LATEX.test(text)) out.add(`${where}: LaTeX in "${field}" (a backslash command or a dollar sign): write plain notation like 3/4, x^2, sqrt(8)`)
    if (text.includes(EM_DASH)) out.add(`${where}: an em dash in "${field}": use a plain dash, a comma or a new sentence`)
  }
  return [...out]
}

function sourceProblems(source: TeachingSource): string[] {
  const out: string[] = []
  if (source.kind === 'siyavula') {
    if (!/Siyavula/.test(source.credit) || !/CC BY 3\.0/.test(source.credit) || !/Grade \d+/.test(source.credit)) out.push('source: the credit line must read "Based on Siyavula ..., Grade N, <chapter>, CC BY 3.0"')
    if (!source.address?.startsWith('https://www.siyavula.com/read/')) out.push('source: a Siyavula source needs the address of its chapter')
    if (!source.licence?.includes('Creative Commons Attribution')) out.push('source: a Siyavula source needs the licence line found on the page')
  } else if (source.kind === 'caps') {
    if (source.credit.trim() !== CAPS_CREDIT) out.push(`source: the credit line must read "${CAPS_CREDIT}"`)
  }
  return out
}

/** All checks of one lesson. Empty means it passes. */
export function checkLesson(lesson: TeachingLesson, ctx: CheckContext): string[] {
  const problems: string[] = []

  const workedCount = lesson.blocks.filter((b) => b.kind === 'worked').length
  const need = WORKED_MIN(ctx.grade)
  if (workedCount < need) problems.push(`lesson: needs at least ${need} worked blocks (has ${workedCount})`)

  const firstWorked = lesson.blocks.findIndex((b) => b.kind === 'worked')
  const firstTry = lesson.blocks.findIndex((b) => b.kind === 'try')
  if (firstTry !== -1 && (firstWorked === -1 || firstTry < firstWorked)) problems.push(`block ${firstTry + 1} (try): the try block comes before any worked example: the learner must be shown how first`)

  lesson.blocks.forEach((b, i) => {
    problems.push(...blockProblems(b, i + 1, ctx))
    problems.push(...textProblems(b, `block ${i + 1} (${b.kind})`))
  })

  lesson.practice.forEach((q, i) => {
    problems.push(...questionProblems(q, `practice ${i + 1}`, ctx))
    problems.push(...textProblems(q, `practice ${i + 1}`))
  })
  const harder = lesson.practice.findIndex((q, i) => i > 0 && q.difficulty < lesson.practice[i - 1]!.difficulty)
  if (harder !== -1) problems.push(`practice: easiest first, but question ${harder + 1} (difficulty ${lesson.practice[harder]!.difficulty}) comes after a harder one`)

  problems.push(...textProblems({ title: lesson.title, objectives: lesson.objectives, keyWords: lesson.keyWords, summary: lesson.summary }, 'lesson'))
  problems.push(...sourceProblems(ctx.source))
  return problems
}

// ---- small repairs the code may make --------------------------------------------------------------------------------------------------

const PLAIN_VALUE_KINDS = new Set(['whole', 'decimal', 'fraction', 'mixed', 'number'])
const TRAILING_UNIT = /\s+(?:[A-Za-z°%²³/.]+\s*)+$/

/**
 * An answer that is a value followed by its unit ("12 cm", "4,90 m", "1 1/2 km") is cut to the value when the value alone can be marked.
 * The unit stays where it belongs: in the problem and in the working. Nothing else is changed, and an answer that is wrong stays wrong.
 */
export function tidyAnswer(answer: string, kind: string, grade: number): string {
  if (!PLAIN_VALUE_KINDS.has(kind) || !TRAILING_UNIT.test(answer)) return answer
  if (grade <= 6 && !(PRIMARY_ANSWER_KINDS as readonly string[]).includes(kind)) return answer
  const stripped = answer.replace(TRAILING_UNIT, '').trim()
  if (!stripped) return answer
  const q = { prompt: '', render: 'text' as const, answer, answerKind: kind as Question['answerKind'], difficulty: 1 as const, why: '', rightWay: '' }
  return answerProblem(q) !== null && answerProblem({ ...q, answer: stripped }) === null ? stripped : answer
}

/** The lesson with the units cut from the answers of its worked examples, "your turn" questions and practice questions (see `tidyAnswer`). */
export function tidyLesson(lesson: TeachingLesson, grade: number): TeachingLesson {
  const question = (q: Question): Question => ({ ...q, answer: tidyAnswer(q.answer, q.answerKind, grade) })
  return {
    ...lesson,
    blocks: lesson.blocks.map((b) => (b.kind === 'worked' ? { ...b, answer: tidyAnswer(b.answer, b.answerKind, grade) } : b.kind === 'try' ? { ...b, question: question(b.question) } : b)),
    practice: lesson.practice.map(question),
  }
}
