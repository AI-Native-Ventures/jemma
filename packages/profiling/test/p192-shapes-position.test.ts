import { describe, expect, test } from 'vitest'
import { KIT_PICTURES, MIRROR_BULLET, PICTURE_CHOICES_BULLET, PICTURE_KITS, pictureBullet, primaryAnswerBlock, primaryKit } from '../src/ai/primary-answers'
import { renderPrompt } from '../src/ai/prompt-variants'
import { makeClassContext } from '../src/ai/subject-profile'
import { isSeniorQuestion } from '../src/logic/answers/quantity'
import { pictureProblem, questionPictureProblem } from '../src/logic/picture'
import { isSymmetryLine, placeMarks, SOLID_COUNTS } from '../src/logic/question-pictures'
import { DiagramSpecSchema, PrimaryPictureSpecSchema, SeniorDiagramSpecSchema, type SeniorDiagramSpec } from '../src/schemas/diagram'
import type { Question } from '../src/schemas/lesson'
import { PrimaryExtraQuestionSchema } from '../src/schemas/primary-extra'
import { answerProblem } from '../src/tools/save/save-lesson'

// P192: the pictures of the "Shapes and position" board: a map on a grid, a 3D object, a shape built from cubes and lines across a shape. A choice of a question of
// Grades 1 to 6 may now be a picture too (a net of a cube, a view from the top). The demo schema does not change. No database, no network, no model.

const klass = (grade: number, country = 'ZA') => makeClassContext({ classId: 'c', subject: 'Mathematics', grade, country })

const MAP: SeniorDiagramSpec = {
  kind: 'map_grid',
  cols: 6,
  rows: 5,
  places: [
    { name: 'Home', col: 0, row: 0, house: true },
    { name: 'School', col: 3, row: 2 },
    { name: 'Shop', col: 5, row: 1 },
  ],
}
const HEART: SeniorDiagramSpec = { kind: 'symmetry_lines', shape: 'heart', lines: ['vertical', 'horizontal', 'diagonal'] }
const GOOD: SeniorDiagramSpec[] = [MAP, { kind: 'solid', shape: 'square_pyramid' }, { kind: 'cube_stack', heights: [[2, 1, 1]] }, HEART]
const net = (cells: [number, number][]) => ({ diagram: { kind: 'grid_area' as const, cols: 4, rows: 3, cells } })

const question = (over: Partial<Question> = {}): Question => ({
  prompt: 'Which line is a line of symmetry?',
  render: 'text',
  answer: 'A',
  answerKind: 'choice',
  choices: ['A', 'B', 'C'],
  difficulty: 1,
  why: 'Fold along it and the halves match.',
  rightWay: 'Line A cuts the heart into two mirror halves.',
  ...over,
})

describe('the schemas', () => {
  test.each(GOOD.map((d) => [d.kind, d] as const))('a question of Grades 1 to 6 may carry %s, and so may the wide reader', (_kind, diagram) => {
    expect(PrimaryExtraQuestionSchema.safeParse(question({ diagram })).success).toBe(true)
    expect(SeniorDiagramSpecSchema.safeParse(diagram).success).toBe(true)
    expect(PrimaryPictureSpecSchema.safeParse(diagram).success).toBe(true)
    expect(DiagramSpecSchema.safeParse(diagram).success).toBe(false)
  })

  test('a choice of a question of Grades 1 to 6 may be a picture of the primary kinds, with or without words', () => {
    const nets = [net([[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]]), { text: 'this one', diagram: net([[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1]]).diagram }, 'none of them']
    expect(PrimaryExtraQuestionSchema.safeParse(question({ prompt: 'Which net folds into a cube?', choices: nets, diagram: { kind: 'solid', shape: 'cube' } })).success).toBe(true)
    expect(PrimaryExtraQuestionSchema.safeParse(question({ choices: [{ diagram: { kind: 'coordinate_plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5 } }, 'B'] as never })).success).toBe(false)
  })
})

describe('the pictures that make sense, and the ones that do not', () => {
  test.each(GOOD.map((d) => [d.kind, d] as const))('%s makes sense', (_kind, d) => {
    expect(pictureProblem(d)).toBeNull()
    expect(questionPictureProblem(d)).toBeNull()
    expect(isSeniorQuestion(question({ diagram: d }))).toBe(false)
  })

  test.each([
    ['a map of 10 columns', { ...MAP, cols: 10 }, '3 to 8 columns'],
    ['a place off the map', { ...MAP, places: [{ name: 'Park', col: 6, row: 0 }] }, 'on a square of the map'],
    ['two places on a square', { ...MAP, places: [{ name: 'Park', col: 1, row: 1 }, { name: 'Pool', col: 1, row: 1 }] }, 'a square of its own'],
    ['two houses', { ...MAP, places: [{ name: 'A', col: 0, row: 0, house: true }, { name: 'B', col: 1, row: 0, house: true }] }, 'at most one house'],
    ['a stack of 4', { kind: 'cube_stack', heights: [[4]] }, '0 to 3 cubes'],
    ['rows of different lengths', { kind: 'cube_stack', heights: [[1, 1], [1]] }, 'each row as long'],
    ['no cubes', { kind: 'cube_stack', heights: [[0, 0]] }, 'at least one cube'],
    ['one line', { ...HEART, lines: ['vertical'] }, '2 to 4 different'],
    ['the same line twice', { ...HEART, lines: ['vertical', 'vertical'] }, '2 to 4 different'],
  ] as const)('%s', (_name, d, words) => {
    expect(pictureProblem(d as unknown as SeniorDiagramSpec)).toContain(words)
  })
})

describe('the key fits the picture', () => {
  test('the line named by the key of a symmetry question is a line of symmetry', () => {
    expect(answerProblem(question({ diagram: HEART }))).toBeNull()
    expect(answerProblem(question({ diagram: HEART, answer: 'B' }))).toContain('line B is not a line of symmetry of the heart')
    const arrow: SeniorDiagramSpec = { kind: 'symmetry_lines', shape: 'arrow', lines: ['vertical', 'horizontal'] }
    expect(answerProblem(question({ diagram: arrow, answer: 'B', choices: ['A', 'B'] }))).toBeNull()
    // Choices that are not the letters of the lines are up to the question.
    expect(answerProblem(question({ prompt: 'How many lines of symmetry does a heart have?', diagram: HEART, answer: 'A', choices: ['1', '2', '3'] }))).toBeNull()
  })

  test('a question with picture choices is checked as any choice question', () => {
    const q = question({ prompt: 'Which net folds into a cube?', answer: 'A', choices: [net([[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]]), net([[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1]])], diagram: { kind: 'solid', shape: 'cube' } })
    expect(answerProblem(q)).toBeNull()
    expect(answerProblem({ ...q, answer: 'C' })).toContain('not one of the 2 choices')
  })
})

describe('the helpers the screen and the gate share', () => {
  test('each 3D object has its faces, edges and corners', () => {
    expect(SOLID_COUNTS.square_pyramid).toEqual({ faces: 5, edges: 8, corners: 5 })
    expect(SOLID_COUNTS.triangular_prism).toEqual({ faces: 5, edges: 9, corners: 6 })
    // Euler's rule for the ones with flat faces: faces + corners = edges + 2.
    for (const shape of ['cube', 'cuboid', 'square_pyramid', 'triangular_pyramid', 'triangular_prism']) {
      const n = SOLID_COUNTS[shape]!
      expect(n.faces + n.corners).toBe(n.edges + 2)
    }
  })

  test('which lines cut which shapes into mirror halves', () => {
    expect(isSymmetryLine('heart', 'vertical')).toBe(true)
    expect(isSymmetryLine('heart', 'horizontal')).toBe(false)
    expect(isSymmetryLine('rectangle', 'diagonal')).toBe(false)
    expect(isSymmetryLine('square', 'diagonal')).toBe(true)
    expect(isSymmetryLine('arrow', 'horizontal')).toBe(true)
    expect(isSymmetryLine('arrow', 'vertical')).toBe(false)
  })

  test('a place is marked with its first letter, or two when another starts the same', () => {
    expect(placeMarks(['School', 'Shop', 'Park'])).toEqual(['Sc', 'Sh', 'P'])
    expect(placeMarks(['zoo', 'lake'])).toEqual(['Z', 'L'])
  })
})

describe('the lesson writer', () => {
  test('position and views, 3D objects and symmetry have picture kits of their own, never for the baseline class', () => {
    expect(PICTURE_KITS).toEqual(expect.arrayContaining(['position', 'solids', 'symmetry']))
    expect(primaryKit(klass(2), 'Position, orientation and views')).toBe('position')
    expect(primaryKit(klass(5), 'Viewing objects')).toBe('position')
    expect(primaryKit(klass(1), '3-D objects')).toBe('solids')
    expect(primaryKit(klass(5), 'Properties of 3-D objects')).toBe('solids')
    expect(primaryKit(klass(3), 'Symmetry')).toBe('symmetry')
    expect(primaryKit(klass(4, 'US'), 'Lines and symmetry')).toBe('symmetry')
    for (const topic of ['Viewing objects', '3-D objects', 'Symmetry', 'Position and movement']) expect(primaryKit(klass(6), topic)).toBeNull()
    expect(KIT_PICTURES.position).toEqual(['map_grid', 'cube_stack', 'grid_area'])
    expect(KIT_PICTURES.solids).toEqual(['solid', 'grid_area'])
    expect(KIT_PICTURES.symmetry).toEqual(['symmetry_lines'])
  })

  test('views and nets may be picture choices', () => {
    expect(primaryAnswerBlock('solids', klass(5))).toBe(`${pictureBullet('solids', klass(5))}\n${PICTURE_CHOICES_BULLET}`)
    expect(primaryAnswerBlock('position', klass(5))).toContain(PICTURE_CHOICES_BULLET)
    // P194: symmetry also has its line for finishing a shape.
    expect(primaryAnswerBlock('symmetry', klass(5))).toBe(`${pictureBullet('symmetry', klass(5))}\n${MIRROR_BULLET}`)
    expect(pictureBullet('position', klass(2))).not.toContain('`cube_stack`')
    expect(pictureBullet('symmetry', klass(3))).toContain('draw exactly one line of symmetry')
    for (const text of [PICTURE_CHOICES_BULLET, pictureBullet('position', klass(5))!, pictureBullet('solids', klass(1))!]) expect(text).not.toContain(String.fromCharCode(0x2014))
  })

  test('the senior writer is told of all four', () => {
    const senior = renderPrompt('write_lesson', 'Use only the diagram kinds in the schema.', klass(8))
    for (const kind of ['`solid`', '`cube_stack`', '`map_grid`', '`symmetry_lines`']) expect(senior).toContain(kind)
  })
})
