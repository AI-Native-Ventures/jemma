import type { TeachingLesson, TeachingSource } from '@jemma/profiling/schemas'
import { forChild, markLessonQuestion, stripLessonQuestion, type LessonAnswerResult, type StrippedQuestion, type TeachingLessonForChild } from '@/lib/teaching'
import file from './library.json'

// The eight real lessons of the teaching library for Grade 11 "Equations and inequalities", saved as they are stored (library.json: the database id is the
// only thing taken out). The tour reads them from the bundle: no database, no model. The learner's screen gets each lesson through `forChild`, as the
// real app does, so a question the learner is asked reaches a component without its answer; the answer is looked up here, in the saved copy, to mark.

type Row = { grade: number; base_name: string; family: string; position: number; title: string; version: number; source: TeachingSource; content: TeachingLesson }

/** The lessons in teaching order. */
export const TOUR_LIBRARY: Row[] = (file as unknown as Row[]).slice().sort((a, b) => a.position - b.position)

/** One line of the lesson list: what the learner sees before opening a lesson. */
export type TourLibraryEntry = { position: number; title: string; minutes: number }

export const tourLibraryEntries = (): TourLibraryEntry[] => TOUR_LIBRARY.map((r) => ({ position: r.position, title: r.title, minutes: r.content.minutes }))

/** The saved lesson at a place (1 to 8), whole, or null when there is none. */
export const tourLibraryRow = (position: number): Row | null => TOUR_LIBRARY.find((r) => r.position === position) ?? null

/** What a lesson's screen holds: the lesson with no answer of any question the learner is asked, and where it was written from. Null for a place with no lesson. */
export function tourLessonForReader(position: number): { entry: TourLibraryEntry; lesson: TeachingLessonForChild; source: TeachingSource; count: number } | null {
  const row = tourLibraryRow(position)
  if (!row) return null
  return { entry: { position: row.position, title: row.title, minutes: row.content.minutes }, lesson: forChild(row.content), source: row.source, count: TOUR_LIBRARY.length }
}

/** The question of the lesson's practice at a place (from 0) as the answer screen holds it (no answer), or null. */
export function tourPracticeQuestion(position: number, index: number): StrippedQuestion | null {
  const q = tourLibraryRow(position)?.content.practice[index]
  return q ? stripLessonQuestion(q) : null
}

/** How many questions the lesson's practice has. */
export const tourPracticeCount = (position: number): number => tourLibraryRow(position)?.content.practice.length ?? 0

/** Marks a typed answer to a question of the lesson's practice with the library's own marking (`markLessonQuestion`), in the saved copy. Null when there is no such question. */
export function markTourPractice(position: number, index: number, typed: string): LessonAnswerResult | null {
  const q = tourLibraryRow(position)?.content.practice[index]
  return q ? markLessonQuestion(q, typed) : null
}

/** Marks a typed answer to a "Your turn" question inside a lesson (the block at `block`) the same way. Null when that block is not a question. */
export function markTourBlock(position: number, block: number, typed: string): LessonAnswerResult | null {
  const b = tourLibraryRow(position)?.content.blocks[block]
  return b?.kind === 'try' ? markLessonQuestion(b.question, typed) : null
}
