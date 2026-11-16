'use server'

import { redirect } from 'next/navigation'
import { demoCookie, signInAsPerson } from '@/lib/demo'
import { demoHandbackFacts } from '@/lib/data/p120'
import { parentResultsHref } from '@/lib/handback'

/**
 * "Press and hold" on the hand-back screen, in a demo copy: switches to the made-up grown-up of this learner (the way the demo's own switch does) and opens
 * that grown-up's page for the practice just finished. It does nothing in a copy that is not the demo: there the screen never offers it, and a call made by
 * hand goes back to the learner's own home. The learner and the practice are the ones of this request, never anything the caller sends.
 */
export async function handBackToDemoParent(): Promise<void> {
  const { childId, sessionId, demoParent } = await demoHandbackFacts()
  const sandboxId = await demoCookie()
  if (!demoParent || !sandboxId) redirect('/k')
  await signInAsPerson(sandboxId, { kind: 'parent', key: demoParent })
  redirect(parentResultsHref(childId, sessionId))
}
