import { expect, test } from 'vitest'
import { whatHelps } from '../../src/logic'

test('whatHelps', () => {
  const out = whatHelps([
    ...[4, 4, 5, 4, 4].map((score) => ({ format: 'diagram' as const, score })),
    ...[3, 3, 3].map((score) => ({ format: 'reading' as const, score })),
    { format: 'audio', score: 3 },
  ])
  expect(out.diagram).toEqual({ status: 'measured', average: 4.2, sessions: 5 })
  expect(out.reading).toEqual({ status: 'measured', average: 3, sessions: 3 })
  expect(out.audio).toEqual({ status: 'too_early', sessions: 1 })
})

test('whatHelps with no trials is too early everywhere', () => {
  expect(whatHelps([])).toEqual({
    reading: { status: 'too_early', sessions: 0 },
    diagram: { status: 'too_early', sessions: 0 },
    audio: { status: 'too_early', sessions: 0 },
  })
})
