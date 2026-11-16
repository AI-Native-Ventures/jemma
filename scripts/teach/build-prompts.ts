import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { TeachingLessonSchema, type TeachingLesson } from '@jemma/profiling/schemas'
import { LATEX } from './checks'
import { REFERENCE_CAP, referenceText, type Reference } from './sources'
import type { TopicGroup } from './topics'

const dir = join(import.meta.dirname, 'prompts')
const read = (name: string) => readFileSync(join(dir, name), 'utf8')

/** Fills `{{NAME}}` in a template. A name with no value is an error (a prompt must never go out with a hole in it). */
export function fill(template: string, values: Record<string, string>): string {
  const out = template.replace(/\{\{([A-Z_]+)\}\}/g, (_m, name: string) => {
    const v = values[name]
    if (v === undefined) throw new Error(`prompt has no value for {{${name}}}`)
    return v
  })
  return out
}

export const isFoundation = (grade: number) => grade <= 3
/** Grades 1 to 6 use the six primary answer kinds and the seven primary pictures; Grades 7 to 12 are the senior shape. */
export const isPrimary = (grade: number) => grade <= 6

// ---- the outline -------------------------------------------------------------------------------------------------------------------

export const OutlineSchema = z.object({
  lessons: z
    .array(
      z.object({
        title: z.string().min(1),
        objectives: z.array(z.string().min(1)).min(2).max(4),
        sections: z.array(z.string()).optional(),
        /** On a retry: why an earlier version of this lesson was refused (never asked of a model). */
        hints: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(8),
}).refine((o) => !o.lessons.some((l) => LATEX.test([l.title, ...l.objectives].join(' '))), { message: 'the titles and objectives must be plain text, no LaTeX' })
export type Outline = z.infer<typeof OutlineSchema>

/** How many lessons a topic may have: from the grade, and from how much reference there is. */
export function lessonRange(group: TopicGroup, ref: Reference, pitch: boolean): { min: number; max: number; words: string } {
  let min = 2
  let max = 6
  if (isFoundation(group.grade)) [min, max] = [1, 3]
  else if (group.grade >= 10) [min, max] = [3, 8]
  if (ref.sections.length >= 5 && group.grade >= 10) min = Math.max(min, Math.min(5, ref.sections.length))
  if (pitch) [min, max] = group.grade >= 10 ? [5, 8] : [4, 6]
  const words = isFoundation(group.grade)
    ? `Write ${min} to ${max} lessons. Most Foundation Phase topics need just one or two short lessons.`
    : `Write ${min} to ${max} lessons. A big topic needs more lessons than a small one: split it into ideas a learner can take in one sitting.`
  return { min, max, words }
}

const list = (items: string[]) => (items.length ? items.join('; ') : 'none')

export function outlinePrompt(group: TopicGroup, ref: Reference, pitch: boolean): string {
  return fill(read('outline.md'), {
    GRADE: String(group.grade),
    TOPIC: group.baseName,
    CAPS_NAMES: list(group.capsNames),
    CONTENT_AREA: list(group.contentAreas),
    TERMS: group.terms.join(' and '),
    BEFORE: list(group.before),
    AFTER: list(group.after),
    LESSON_RANGE: lessonRange(group, ref, pitch).words,
    REFERENCE: ref.text,
  })
}

// ---- the writer ----------------------------------------------------------------------------------------------------------------------

const VOICE: Record<'foundation' | 'intermediate' | 'senior' | 'fet', string> = {
  foundation:
    'Write for a child of 6 to 9. Very short sentences of 5 to 8 words. Use things the child can see and touch: apples, sweets, beads, shoes, coins in rand. One idea in each block. Keep numbers small, as CAPS asks for this grade. Use more `diagram` blocks and fewer words. Nearly every question has a whole number as its answer, or is a `choice`.',
  intermediate:
    'Write for a child of 9 to 12. Short, clear sentences. Use everyday South African situations: rand and cents, a tuckshop, a taxi, a soccer game, a school garden. Explain every new word the first time you use it.',
  senior:
    'Write for a learner of 12 to 15. Clear and step by step. Give each new term its meaning the first time it appears and put it in `keyWords`. Link new ideas to what the learner knows from earlier grades.',
  fet: 'Write for a learner of 15 to 18 who is preparing for the national exam. Use the precise terms of the subject (for example domain, range, asymptote, intercept, turning point) and define each one in `keyWords` the first time. Stay plain and direct, never chatty. Show full working the way an exam marker wants to see it.',
}

const band = (grade: number) => (grade <= 3 ? 'foundation' : grade <= 6 ? 'intermediate' : grade <= 9 ? 'senior' : 'fet')

const PRIMARY_ANSWERS = [
  '- `whole`: a whole number, like 12',
  '- `fraction`: like 3/4',
  '- `mixed`: like 1 1/2',
  '- `decimal`: like 0,75 (a comma, not a point)',
  '- `money`: like R5 or R5,50',
  '- `choice`: the letter A, B, C or D of the right option; the options go in `choices`',
].join('\n')

const SENIOR_ANSWERS = [
  PRIMARY_ANSWERS,
  '- `number`: a value with no letters, like -3, 15%, 30°, sqrt(8), 1/2',
  '- `expression`: algebra with a letter, like 2x + 3 or (x + 2)(x - 2). The rule of a graph is an expression too: answer 2x + 1, not y = 2x + 1. Set `form` to "factorised" or "expanded" only when the question asks for that form',
  '- `equation`: the solutions of an equation, like x = 4 (one solution) or x = 3 or x = -1 (two solutions)',
  '- `point`: a point, like (2; -3), a semicolon between the two numbers',
].join('\n')

const PRIMARY_DIAGRAMS = [
  '- `{"kind": "fraction_bar", "rows": [{"parts": 4, "shaded": 3, "label": "3/4"}]}`: one bar a row, cut into equal parts, some shaded',
  '- `{"kind": "number_line", "min": 0, "max": 10, "step": 1, "marks": [{"value": 3, "label": "3"}]}`',
  '- `{"kind": "area_model", "rows": 3, "cols": 4, "shaded": 5}`: a grid of rows and columns, `shaded` cells filled',
  '- `{"kind": "place_value", "columns": ["Th", "H", "T", "U"], "digits": ["2", "4", "0", "7"]}`',
  '- `{"kind": "bar_chart", "bars": [{"label": "Mon", "value": 4}], "yMax": 10}`',
  '- `{"kind": "shape_2d", "shape": "square", "labels": ["4 cm"]}`: shape is square, rectangle, triangle or circle',
  '- `{"kind": "grid_area", "cols": 5, "rows": 4, "cells": [[0, 0], [1, 0]]}`: cells are [column, row] counted from 0',
].join('\n')

const SENIOR_DIAGRAMS = [
  PRIMARY_DIAGRAMS,
  '- `{"kind": "coordinate_plane", "xMin": -4, "xMax": 4, "yMin": -2, "yMax": 8, "step": 1, "points": [{"x": 1, "y": 2, "label": "A"}], "graphs": [...]}`: at most 12 points and 3 graphs. A grid is at most 200 wide (720 wide for a trig graph, x in degrees). Each graph is one of: `{"type": "line", "m": 2, "c": 1}` (y = mx + c); `{"type": "parabola", "a": 1, "p": 0, "q": -1}` (y = a(x - p)^2 + q); `{"type": "hyperbola", "a": 2, "p": 0, "q": 0}` (y = a/(x - p) + q); `{"type": "exponential", "a": 1, "b": 2, "p": 0, "q": 0}` (y = a b^(x - p) + q, b above 0); `{"type": "trig", "fn": "sin", "a": 1, "b": 1, "q": 0}` (y = a fn(bx) + q, fn is sin, cos or tan). Any graph can have a `label`. Careful with signs: the code draws y = a(x - p)^2 + q, so for y = (x + 2)^2 + 1 give p: -2 and q: 1; for y = 2/(x + 1) give p: -1',
  '- `{"kind": "triangle", "vertices": ["A", "B", "C"], "angles": [30, 60, 90], "sides": ["3", "4", "5"], "angleLabels": ["30°", "60°", "90°"], "rightAngleAt": 2}`: lists of three. Give `angles` only when you know all three numbers and they add up to 180. To show an unknown angle leave `angles` out and use `angleLabels` such as ["30°", "x", "90°"]. `rightAngleAt` is the index (0, 1 or 2) of the right angle. The lists `vertices`, `angles`, `sides` and `angleLabels` all go in the same order: if the right angle is at B (index 1), then `rightAngleAt` is 1 and the 90 (or "90°") is the second item of `angles` and of `angleLabels`',
].join('\n')

export type WriteInput = {
  group: TopicGroup
  ref: Reference
  titles: string[]
  position: number
  title: string
  objectives: string[]
  sections?: string[]
  /** Why an earlier version of this lesson was refused, when the lesson is written again from the start (a retry). */
  hints?: string[]
  /** On a rewrite: what was wrong, and the lesson that had it. */
  rewrite?: { problems: string[]; previous: TeachingLesson }
}

const SENIOR_PICTURES = new Set(['coordinate_plane', 'triangle'])
const SENIOR_ANSWERS_SET = new Set(['number', 'expression', 'equation', 'point'])

/** The JSON Schema with the senior pictures and the four senior answer kinds taken out, for Grades 1 to 6 (the checks refuse them there). */
function primaryOnly(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(primaryOnly)
  if (!node || typeof node !== 'object') return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'oneOf' && Array.isArray(value)) {
      const isSenior = (x: unknown) => SENIOR_PICTURES.has(String(((x as { properties?: { kind?: { const?: unknown } } })?.properties?.kind?.const) ?? ''))
      out[key] = value.filter((x) => !isSenior(x)).map(primaryOnly)
    } else if (key === 'enum' && Array.isArray(value) && value.includes('fraction') && value.includes('choice')) out[key] = value.filter((x) => !SENIOR_ANSWERS_SET.has(String(x)))
    else out[key] = primaryOnly(value)
  }
  return out
}

const schemaCache = new Map<boolean, string>()
/** The JSON Schema of one lesson, compact. `primary` leaves out what Grades 1 to 6 may not use. */
export function lessonSchemaText(primary = false): string {
  const hit = schemaCache.get(primary)
  if (hit) return hit
  const schema = z.toJSONSchema(TeachingLessonSchema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>
  delete schema.$schema
  const text = JSON.stringify(primary ? primaryOnly(schema) : schema)
  schemaCache.set(primary, text)
  return text
}

/** The first line of the part of a write prompt that changes from lesson to lesson. Everything above it is the same for every lesson of a topic, so a provider's prompt cache serves it. */
export const WRITE_VARIES_FROM = '## The lesson to write now'
/** The same for a review prompt. */
export const REVIEW_VARIES_FROM = '## The lesson to check now'

export function writePrompt(input: WriteInput): string {
  const { group } = input
  const g = group.grade
  const problems = input.rewrite
    ? `\n## Your last attempt had problems: fix every one\n\n${input.rewrite.problems.map((p) => `- ${p}`).join('\n')}\n\nHere is the lesson you wrote. Write the whole lesson again with every problem fixed and everything else as good as before or better:\n\n${JSON.stringify(input.rewrite.previous)}\n`
    : ''
  // The sections this lesson draws on, in full, go with the part that changes: the fixed reference above is the same for every lesson of the topic.
  const hints = !input.rewrite && input.hints?.length ? `\n## An earlier version of this lesson was refused for these reasons: do not repeat them\n\n${input.hints.map((p) => `- ${p}`).join('\n')}\n` : ''
  const picked = input.sections?.length ? input.ref.sections.filter((s) => input.sections!.includes(s.id)) : []
  const focus = picked.length ? `\n## The sections of the reference to teach this lesson from, in full\n\n${referenceText(input.ref, input.sections)}\n` : ''
  return fill(read('write.md'), {
    GRADE: String(g),
    TOPIC: group.baseName,
    KEYWORDS_HINT: g >= 7 ? 'Include every technical term of the lesson.' : 'Use it only for words the learner may not know yet.',
    BLOCK_RANGE: isFoundation(g) ? '8 to 14' : '14 to 24 (never more than 30)',
    EXPLAIN_LIMIT: isFoundation(g) ? 'At most 30 words in `text`.' : 'At most about 90 words in `text`.',
    WORKED_MIN: isFoundation(g) ? '2' : '3',
    VOICE: VOICE[band(g)],
    ANSWER_KINDS: isPrimary(g) ? PRIMARY_ANSWERS : SENIOR_ANSWERS,
    DIAGRAMS: isPrimary(g) ? PRIMARY_DIAGRAMS : SENIOR_DIAGRAMS,
    REFERENCE: input.ref.text.slice(0, REFERENCE_CAP),
    SCHEMA: lessonSchemaText(isPrimary(g)),
    POSITION: String(input.position),
    TOTAL: String(input.titles.length),
    LESSON_TITLES: input.titles.map((t, i) => `  ${i + 1}. ${t}`).join('\n'),
    TITLE: input.title,
    OBJECTIVES: input.objectives.map((o) => `  - ${o}`).join('\n'),
    FOCUS: focus,
    PROBLEMS: hints + problems,
  })
}

// ---- the reviewer --------------------------------------------------------------------------------------------------------------------

export const ReviewSchema = z.object({ ok: z.boolean(), problems: z.array(z.string()).default([]) })
export type Review = z.infer<typeof ReviewSchema>

export function reviewPrompt(group: TopicGroup, ref: Reference, lesson: TeachingLesson, total: number): string {
  return fill(read('review.md'), {
    GRADE: String(group.grade),
    TOPIC: group.baseName,
    REFERENCE: ref.text.slice(0, 12_000),
    POSITION: String(lesson.position),
    TOTAL: String(total),
    TITLE: lesson.title,
    OBJECTIVES: lesson.objectives.map((o) => `  - ${o}`).join('\n'),
    LESSON: JSON.stringify(numbered(lesson)),
  })
}

/** The lesson with each block numbered from 1, so a reviewer can say where a problem is. */
function numbered(lesson: TeachingLesson) {
  return { ...lesson, blocks: lesson.blocks.map((b, i) => ({ n: i + 1, ...b })) }
}
