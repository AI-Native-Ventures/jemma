import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hillviewPeople } from '../../../supabase/seed/fixtures/hillview'
import { demoParentKey, handbackTarget, parentResultsHref, practiceResultsHref } from '../lib/handback'

// P120: where "Press and hold" on the hand-back screen goes. Pure facts in, one target out: no database, no browser.

const base = { childId: 'c1', sessionId: 's1' }

describe('the hand-back target', () => {
  it('a grown-up who handed the phone over opens their own page for this practice', () => {
    expect(handbackTarget({ ...base, parentHere: true, demoParent: null })).toEqual({ kind: 'open', href: '/p/c1/sessions/s1' })
  })

  it('a grown-up with no practice to name opens the child page', () => {
    expect(handbackTarget({ ...base, sessionId: null, parentHere: true, demoParent: null })).toEqual({ kind: 'open', href: '/p/c1' })
  })

  it('a made-up learner of a demo copy with a made-up grown-up switches to the grown-up and lands on the same page', () => {
    expect(handbackTarget({ ...base, parentHere: false, demoParent: 'thandi' })).toEqual({ kind: 'demo-parent', href: '/p/c1/sessions/s1' })
  })

  it('a learner with a code login and nobody to hand the phone to goes back to their own home, with no hold', () => {
    expect(handbackTarget({ ...base, parentHere: false, demoParent: null })).toEqual({ kind: 'home', href: '/k' })
  })

  it('a learner on their own is the same case: the way back is their home', () => {
    expect(handbackTarget({ childId: 'c9', sessionId: null, parentHere: false, demoParent: null })).toEqual({ kind: 'home', href: '/k' })
  })

  it('a grown-up who is really there wins over the demo', () => {
    expect(handbackTarget({ ...base, parentHere: true, demoParent: 'thandi' }).kind).toBe('open')
  })

  it('never sends anyone to the demo list of people, whatever the facts are', () => {
    for (const parentHere of [true, false]) {
      for (const demoParent of ['thandi', null]) {
        for (const sessionId of ['s1', null]) {
          expect(JSON.stringify(handbackTarget({ childId: 'c1', sessionId, parentHere, demoParent }))).not.toContain('/demo/switch')
        }
      }
    }
  })
})

describe('the links', () => {
  it('the grown-up page of a practice, and of a child with none', () => {
    expect(parentResultsHref('c1', 's1')).toBe('/p/c1/sessions/s1')
    expect(parentResultsHref('c1', null)).toBe('/p/c1')
  })

  it('the learner page of a practice, with a way back that says where it was opened from', () => {
    expect(practiceResultsHref('s1')).toBe('/k/session/s1/results')
    expect(practiceResultsHref('s1', 'done')).toBe('/k/session/s1/results?from=done')
  })
})

describe('the made-up grown-up of a made-up learner', () => {
  const parents = hillviewPeople(new Date().getUTCFullYear()).parents

  it('Amina is the child of Thandi', () => {
    expect(demoParentKey('Amina', parents)).toBe('thandi')
    expect(demoParentKey(' amina ', parents)).toBe('thandi')
  })

  it('a child who is on their own in the demo has no grown-up to switch to', () => {
    const alone = parents.flatMap((p) => p.children).find((c) => c.alone)
    expect(alone).toBeTruthy()
    expect(demoParentKey(alone!.name, parents)).toBeNull()
  })

  it('a name nobody has is null', () => {
    expect(demoParentKey('Nobody Atall', parents)).toBeNull()
  })
})

describe('the hand-back screen files', () => {
  it('none of them names the demo list of people: a real learner must never be sent there', () => {
    const dir = resolve(import.meta.dirname, '../app/k/done')
    for (const file of ['page.tsx', 'HoldToOpen.tsx', 'actions.ts']) {
      expect(readFileSync(resolve(dir, file), 'utf8'), file).not.toContain('/demo/switch')
    }
    expect(readFileSync(resolve(import.meta.dirname, '../lib/handback.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('/demo/switch')
  })
})
