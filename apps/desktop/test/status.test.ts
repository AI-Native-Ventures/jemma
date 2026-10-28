import { describe, expect, it } from 'vitest'
import { describeStatus, describeJob } from '../src/status'

describe('status in plain words', () => {
  it('names the state when nothing is running', () => {
    expect(describeStatus({ kind: 'off' })).toBe('Jemma Desktop is off')
    expect(describeStatus({ kind: 'idle' })).toBe('Idle')
    expect(describeStatus({ kind: 'paused' })).toBe('Paused')
  })

  it('says which paper of how many is being read', () => {
    expect(describeJob('paper.snapped', { done: 2, total: 5 })).toBe('Reading 3 of 5 papers')
    expect(describeJob('paper.checked', { done: 4, total: 5 })).toBe('Reading 5 of 5 papers')
    expect(describeJob('paper.snapped', { done: 5, total: 5 })).toBe('Reading 5 of 5 papers')
  })

  it('has a plain line for every other event', () => {
    expect(describeJob('paper.snapped', null)).toBe('Reading a paper')
    expect(describeJob('homework.snapped', null)).toBe('Reading homework')
    expect(describeJob('curriculum.uploaded', null)).toBe('Reading the curriculum')
    expect(describeJob('key.snapped', null)).toBe('Reading the answer key')
    expect(describeJob('session.finished', null)).toBe('Updating a learner profile')
    expect(describeJob('observation.added', null)).toBe('Updating a learner profile')
    expect(describeJob('something.else', null)).toBe('Working on a job')
  })

  it('shows a running job as its words', () => {
    expect(describeStatus({ kind: 'running', label: 'Reading 3 of 5 papers' })).toBe('Reading 3 of 5 papers')
  })
})
