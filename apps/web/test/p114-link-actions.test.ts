// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A parent links to a learner who signed up alone (P114), the two actions. `linkChildWithCode({ code })` checks that a parent is signed in, hands the code to the
// work in the profiling package, sends the parent to the child's page on a good code and says a refusal in words. `makeMyParentCode()` checks that a learner is
// signed in who signed up alone and answers the new code. The sign-in and the work are stand-ins: no database, no browser.

const state = vi.hoisted(() => ({
  signedInAs: 'parent' as 'parent' | 'learner' | null,
  linked: [] as { parentId: string; code: string }[],
  link: { ok: true, childId: 'child-1', firstName: 'Neo' } as { ok: true; childId: string; firstName: string } | { ok: false; reason: string },
  linkFails: null as Error | null,
  alone: { id: 'child-1', firstName: 'Neo' } as { id: string; firstName: string } | null,
  made: [] as { childId: string; actorUserId: string }[],
  makeFails: null as Error | null,
}))

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
}))
vi.mock('@/lib/auth', () => ({
  requireRole: async (role: string) => {
    if (state.signedInAs !== role) throw new Error(`REDIRECT /sign-in (needs ${role})`)
    return { userId: `${role}-1`, profile: { display_name: 'Palesa M' } }
  },
}))
vi.mock('@/lib/parent-invite', () => {
  class ParentCodeError extends Error {}
  return {
    ParentCodeError,
    independentChildOf: async () => state.alone,
    makeParentCode: async (childId: string, actorUserId: string) => {
      state.made.push({ childId, actorUserId })
      if (state.makeFails) throw state.makeFails
      return { code: 'K7M2QX', expiresAt: '2026-11-23T10:00:00.000Z' }
    },
    linkParentWithCode: async (parentId: string, code: string) => {
      state.linked.push({ parentId, code })
      if (state.linkFails) throw state.linkFails
      return state.link
    },
  }
})

import { linkChildWithCode } from '../app/p/add/link-actions'
import { makeMyParentCode } from '../app/k/me/parent-code-actions'
import { ParentCodeError } from '../lib/parent-invite'

beforeEach(() => {
  state.signedInAs = 'parent'
  state.linked = []
  state.link = { ok: true, childId: 'child-1', firstName: 'Neo' }
  state.linkFails = null
  state.alone = { id: 'child-1', firstName: 'Neo' }
  state.made = []
  state.makeFails = null
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('linkChildWithCode (the parent’s action)', () => {
  it('links the signed-in parent with the code as typed and sends the parent to the child’s page', async () => {
    await expect(linkChildWithCode({ code: 'k7m 2qx' })).rejects.toThrow('REDIRECT /p/child-1')
    expect(state.linked).toEqual([{ parentId: 'parent-1', code: 'k7m 2qx' }])
  })

  it('lands on the page of the child the code belongs to', async () => {
    state.link = { ok: true, childId: 'child-77', firstName: 'Zola' }
    await expect(linkChildWithCode({ code: 'K7M2QX' })).rejects.toThrow('REDIRECT /p/child-77')
  })

  it('a person who is not a signed-in parent never reaches the work: a learner is sent away, a signed-out visitor too', async () => {
    for (const who of ['learner', null] as const) {
      state.signedInAs = who
      await expect(linkChildWithCode({ code: 'K7M2QX' })).rejects.toThrow('REDIRECT /sign-in')
    }
    expect(state.linked).toEqual([])
  })

  it('a code that is wrong, run out or used comes back in the words of the work, with no redirect', async () => {
    for (const reason of ['That code is not right. Check it with your child.', 'That code has run out. Ask your child for a new one.']) {
      state.link = { ok: false, reason }
      expect(await linkChildWithCode({ code: 'ZZZZZZ' })).toEqual({ ok: false, message: reason })
    }
  })

  it('any other failure is one plain sentence, never the reason of the database', async () => {
    state.linkFails = new Error('duplicate key value violates unique constraint "parent_links_pkey"')
    const result = await linkChildWithCode({ code: 'K7M2QX' })
    expect(result).toEqual({ ok: false, message: 'Could not link your child. Try again.' })
    expect(JSON.stringify(result)).not.toContain('duplicate')
  })
})

describe('makeMyParentCode (the learner’s action)', () => {
  beforeEach(() => {
    state.signedInAs = 'learner'
  })

  it('makes the code for the signed-in learner’s own child and answers it', async () => {
    expect(await makeMyParentCode()).toEqual({ ok: true, code: 'K7M2QX' })
    expect(state.made).toEqual([{ childId: 'child-1', actorUserId: 'learner-1' }])
  })

  it('a learner of a school (no child who signed up alone) gets words and nothing is made', async () => {
    state.alone = null
    expect(await makeMyParentCode()).toEqual({ ok: false, message: 'A code is for a learner who signed up on their own.' })
    expect(state.made).toEqual([])
  })

  it('a parent or a signed-out visitor never reaches the work', async () => {
    for (const who of ['parent', null] as const) {
      state.signedInAs = who
      await expect(makeMyParentCode()).rejects.toThrow('REDIRECT /sign-in')
    }
    expect(state.made).toEqual([])
  })

  it('a plain refusal of the work comes back as its own words; any other failure is one plain sentence', async () => {
    state.makeFails = new ParentCodeError('Only you can make a code for yourself.')
    expect(await makeMyParentCode()).toEqual({ ok: false, message: 'Only you can make a code for yourself.' })
    state.makeFails = new Error('connection terminated')
    const result = await makeMyParentCode()
    expect(result).toEqual({ ok: false, message: 'Could not make a code. Try again.' })
    expect(JSON.stringify(result)).not.toContain('connection')
  })
})
