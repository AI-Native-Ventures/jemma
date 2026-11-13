import { describe, expect, test } from 'vitest'
import { allowedFamilies } from '../src/imports'
import { memoryDb } from './helpers/memory-db'

// The strands a class offers to "Add past records": the families of its approved map, read in their plain form (decision 1 of P73).
// Nothing stored changes: the topics keep the words the model wrote.

const topic = (map_id: string, family: string | null, term: number, position: number) => ({ id: `${map_id}-${term}-${position}`, map_id, family, term, position, name: `Topic ${term}.${position}` })

describe('allowedFamilies reads the families of the approved map in their plain form', () => {
  test('a map the model drafted with `numbers` and `shape` offers `whole_numbers` and `shapes`', async () => {
    const db = memoryDb({
      curriculum_maps: [{ id: 'map-1', class_id: 'cl-1', status: 'approved' }],
      topics: [topic('map-1', 'numbers', 1, 1), topic('map-1', 'shape', 1, 2), topic('map-1', 'fractions', 2, 1), topic('map-1', 'measurement', 3, 1)],
    })
    const out = await allowedFamilies(db, 'cl-1', 'Mathematics')
    expect(out).toEqual([
      { family: 'whole_numbers', label: 'Whole numbers' },
      { family: 'shapes', label: 'Shapes and space' },
      { family: 'fractions', label: 'Fractions' },
      { family: 'measurement', label: 'Measurement' },
    ])
  })

  test('two spellings of one strand give one choice, in the place of the first, with no doubles', async () => {
    const db = memoryDb({
      curriculum_maps: [{ id: 'map-1', class_id: 'cl-1', status: 'approved' }],
      topics: [
        topic('map-1', 'numbers', 1, 1),
        topic('map-1', 'fractions', 1, 2),
        topic('map-1', 'whole_numbers', 2, 1),
        topic('map-1', 'Number Operations', 2, 2),
        topic('map-1', 'Fractions', 3, 1),
        topic('map-1', 'geometry', 3, 2),
        topic('map-1', 'shapes', 4, 1),
      ],
    })
    const out = await allowedFamilies(db, 'cl-1', 'Mathematics')
    expect(out!.map((f) => f.family)).toEqual(['whole_numbers', 'fractions', 'shapes'])
    expect(new Set(out!.map((f) => f.family)).size).toBe(out!.length)
  })

  test('the order of the map is kept: term first, then position', async () => {
    const db = memoryDb({
      curriculum_maps: [{ id: 'map-1', class_id: 'cl-1', status: 'approved' }],
      topics: [topic('map-1', 'data', 3, 1), topic('map-1', 'shape', 1, 2), topic('map-1', 'numbers', 1, 1), topic('map-1', 'decimals', 2, 1)],
    })
    const out = await allowedFamilies(db, 'cl-1', 'Maths')
    expect(out!.map((f) => f.family)).toEqual(['whole_numbers', 'shapes', 'decimals', 'data'])
  })

  test('a family that is not one of the known strands is offered in its plain form with underscores, and a topic with no family is left out', async () => {
    const db = memoryDb({
      curriculum_maps: [{ id: 'map-1', class_id: 'cl-1', status: 'approved' }],
      topics: [topic('map-1', 'Patterns and Algebra', 1, 1), topic('map-1', null, 1, 2), topic('map-1', '', 1, 3), topic('map-1', 'algebra', 2, 1)],
    })
    const out = await allowedFamilies(db, 'cl-1', 'Mathematics')
    expect(out).toEqual([
      { family: 'patterns_and_algebra', label: 'Patterns and algebra' },
      { family: 'algebra', label: 'Algebra' },
    ])
  })

  test('the topics in the database are not changed', async () => {
    const db = memoryDb({
      curriculum_maps: [{ id: 'map-1', class_id: 'cl-1', status: 'approved' }],
      topics: [topic('map-1', 'numbers', 1, 1), topic('map-1', 'shape', 1, 2)],
    })
    await allowedFamilies(db, 'cl-1', 'Mathematics')
    expect(db.tables.topics!.map((t) => t.family)).toEqual(['numbers', 'shape'])
  })

  test('a class with no approved map still gets the strands the app knows for the subject', async () => {
    const db = memoryDb({ curriculum_maps: [{ id: 'map-1', class_id: 'cl-1', status: 'draft' }], topics: [topic('map-1', 'numbers', 1, 1)] })
    const out = await allowedFamilies(db, 'cl-1', 'Mathematics')
    expect(out!.map((f) => f.family)).toEqual(['whole_numbers', 'fractions', 'decimals', 'shapes', 'measurement', 'data'])
  })
})
