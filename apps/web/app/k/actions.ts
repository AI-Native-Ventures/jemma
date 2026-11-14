'use server'

import { resolveChoice, type PracticeChoice } from '@jemma/profiling/logic'
import { loadChoiceRules } from '@jemma/profiling/orchestrator'
import { revalidatePath } from 'next/cache'
import { retryEvent, sendEvent } from '@/lib/agent'
import { loadLearnerSessions, myChild, newestPracticeEvent, tonightFrom } from '@/lib/data/p27'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export type ActionResult = { ok: true } | { ok: false; message: string }

const UNREACHED = 'Jemma could not be reached. Try again in a minute.'
const NOT_YOURS = 'Jemma cannot practise that. Pick one from your list.'
const fail = (message: string): ActionResult => ({ ok: false, message })
const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * "Practise" on the learner's home and on "My maths": asks Jemma to plan and write a short practice for today. With a `choice` the learner
 * chose what to practise; it is checked here by the planner's own rule (`resolveChoice`: a topic of their map, one of their gaps or a strand of
 * their subject) before an event is sent, and the event carries the words the rule found, not the words that came in. A refused choice answers a
 * plain message and sends nothing. The learner is found the way the learner's screens find them (their own session, or a parent's device after
 * hand-over). Does nothing while a session is due tonight or a practice is being written (one event queued or running), so a second tap
 * makes no second event. Never throws to the screen.
 */
export async function startPractice(choice?: PracticeChoice): Promise<ActionResult> {
  try {
    const { supabase, child } = await myChild()
    const newest = await newestPracticeEvent(child.id)
    if (await inTheWay(supabase, child.id, newest)) return done()
    if (!choice) return await ask(child.id, {})
    const chosen = resolveChoice(choice, await loadChoiceRules(createSupabaseAdmin(), child.id))
    if (!chosen) return fail(NOT_YOURS)
    return await ask(child.id, { topicName: chosen.topicName, ...(chosen.topicId ? { topicId: chosen.topicId } : {}) })
  } catch (e) {
    console.error(`practice not started: ${reasonOf(e)}`)
    return fail('Something went wrong. Try again.')
  }
}

/**
 * "Try again" on the card that says the practice could not be written: puts the newest practice back when it failed (it keeps the choice it
 * was asked with). With none to put back (the newest is over, or there is none) it starts a new one. Does nothing while a session is due or a
 * practice is being written. Never throws to the screen.
 */
export async function retryPractice(): Promise<ActionResult> {
  try {
    const { supabase, child } = await myChild()
    const newest = await newestPracticeEvent(child.id)
    if (await inTheWay(supabase, child.id, newest)) return done()
    if (newest?.status !== 'failed') return await ask(child.id, {})
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

/** A practice is being written, or a session is due tonight (the home's own rule): then a new practice is not asked for. */
async function inTheWay(supabase: Awaited<ReturnType<typeof myChild>>['supabase'], childId: string, newest: { status: string } | null): Promise<boolean> {
  if (newest?.status === 'queued' || newest?.status === 'running') return true
  const sessions = await loadLearnerSessions(supabase, childId)
  return (await tonightFrom(supabase, sessions, newest, new Date().toISOString().slice(0, 10))) !== null
}

function done(): ActionResult {
  revalidatePath('/k')
  revalidatePath('/k/maths')
  return { ok: true }
}

/** A new `practice.requested` event for this learner. An event the agent was not told about is closed as failed at once, so the home shows the retry. */
async function ask(childId: string, choice: { topicId?: string; topicName?: string }): Promise<ActionResult> {
  const asked = new Date().toISOString()
  try {
    await sendEvent('practice.requested', { childId, ...choice })
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
