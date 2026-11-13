'use server'

import { revalidatePath } from 'next/cache'
import { retryEvent, sendEvent } from '@/lib/agent'
import { myChild, newestPracticeEvent } from '@/lib/data/p27'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export type ActionResult = { ok: true } | { ok: false; message: string }

const UNREACHED = 'Jemma could not be reached. Try again in a minute.'
const fail = (message: string): ActionResult => ({ ok: false, message })
const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * "Practise now" on the learner's home: asks Jemma to plan and write a short practice for today. The learner is found the way the learner's
 * screens find them (their own session, or a parent's device after hand-over). Does nothing when a practice is already being written (one
 * event queued or running), so a second tap makes no second event. Never throws to the screen.
 */
export async function startPractice(): Promise<ActionResult> {
  try {
    const { child } = await myChild()
    const newest = await newestPracticeEvent(child.id)
    if (newest?.status === 'queued' || newest?.status === 'running') return done()
    return await ask(child.id)
  } catch (e) {
    console.error(`practice not started: ${reasonOf(e)}`)
    return fail('Something went wrong. Try again.')
  }
}

/**
 * "Try again" on the card that says the practice could not be written: puts the newest practice back when it failed. With none to put back
 * (the newest is over, or there is none) it starts a new one. Does nothing while one is being written. Never throws to the screen.
 */
export async function retryPractice(): Promise<ActionResult> {
  try {
    const { child } = await myChild()
    const newest = await newestPracticeEvent(child.id)
    if (newest?.status === 'queued' || newest?.status === 'running') return done()
    if (newest?.status !== 'failed') return await ask(child.id)
    try {
      await retryEvent(newest.id)
    } catch (e) {
      console.error(`practice ${newest.id} not delivered: ${reasonOf(e)}`)
      // The event is back to queued but the agent was not told, so nobody will pick it up: close it, and the home offers the retry again.
      await createSupabaseAdmin().from('events').update({ status: 'failed', error: reasonOf(e), finished_at: new Date().toISOString() }).eq('id', newest.id).eq('status', 'queued')
      return fail(UNREACHED)
    }
    return done()
  } catch (e) {
    console.error(`practice not retried: ${reasonOf(e)}`)
    return fail('Something went wrong. Try again.')
  }
}

function done(): ActionResult {
  revalidatePath('/k')
  return { ok: true }
}

/** A new `practice.requested` event for this learner. An event the agent was not told about is closed as failed at once, so the home shows the retry. */
async function ask(childId: string): Promise<ActionResult> {
  const asked = new Date().toISOString()
  try {
    await sendEvent('practice.requested', { childId })
  } catch (e) {
    console.error(`practice.requested for ${childId} not delivered: ${reasonOf(e)}`)
    await createSupabaseAdmin()
      .from('events')
      .update({ status: 'failed', error: reasonOf(e), finished_at: new Date().toISOString() })
      .eq('type', 'practice.requested')
      .eq('status', 'queued')
      .eq('payload->>childId', childId)
      .gte('created_at', asked)
    return fail(UNREACHED)
  }
  return done()
}
