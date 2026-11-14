import { describe, expect, it } from 'vitest'
import { capsDraft, capsSource } from '@jemma/profiling/caps'
import { draftedLine, topicCount, type DraftSource } from '../app/t/[classId]/curriculum/format'

// The approved board's log said "Drafted the map from your 0 documents" for a map that came from the official curriculum (CAPS): it has its
// source beside the draft and no document. It now says what was done, in the words of the activity log line the teacher's tap writes.

const source = (grade: number): DraftSource => ({ kind: 'caps', ...capsSource(grade)! })

describe('the line about where the map came from', () => {
  it('a CAPS map with no document says it was loaded, with the grade and the topics', () => {
    const topics = topicCount(capsDraft(9)!)
    expect(draftedLine(source(9), 0, 9, topics)).toBe(`Loaded the CAPS map for Grade 9: ${topics} topics`)
  })

  it('is the same sentence as the line the tap writes to the activity log', () => {
    const topics = topicCount(capsDraft(3)!)
    expect(topics).toBe(93)
    expect(draftedLine(source(3), 0, 3, topics)).toBe('Loaded the CAPS map for Grade 3: 93 topics')
  })

  it('a map drafted from uploaded documents keeps its line', () => {
    expect(draftedLine(undefined, 2, 9, 0)).toBe('Drafted the map from your 2 documents')
    expect(draftedLine(undefined, 1, 9, 0)).toBe('Drafted the map from your 1 document')
  })

  it('a CAPS source that has documents beside it is still a map drafted from documents', () => {
    expect(draftedLine(source(9), 2, 9, 25)).toBe('Drafted the map from your 2 documents')
  })

  it('no source and no document keeps the old words', () => {
    expect(draftedLine(undefined, 0, 9, 0)).toBe('Drafted the map from your 0 documents')
  })
})
