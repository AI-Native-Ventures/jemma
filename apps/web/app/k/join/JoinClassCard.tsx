import { Suspense } from 'react'
import { joinCardFor } from '@/lib/class-join'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { JoinClassForm } from './JoinClassForm'
import { JOIN_WORDS, type JoinPlace } from './words'

const card = 'flex flex-col gap-3 rounded-20 border border-line bg-card p-4'

/** The card itself, drawn by the server (a test calls it as a function). */
export async function JoinClassCardContent({ where }: { where: JoinPlace }) {
  const words = JOIN_WORDS[where]
  let state: Awaited<ReturnType<typeof joinCardFor>> = { kind: 'hidden' }
  try {
    const { data } = await (await createSupabaseServer()).auth.getUser()
    if (data.user) state = await joinCardFor(createSupabaseAdmin(), data.user.id)
  } catch {
    return null
  }
  if (state.kind === 'hidden') return null
  return (
    <section aria-labelledby="join-class" className={card}>
      <h2 id="join-class" className="m-0 text-[19px] leading-[1.25] font-bold">
        {words.heading}
      </h2>
      {state.kind === 'waiting' ? (
        <>
          <p className="m-0 text-[17px] leading-[1.4] font-semibold">Waiting for {state.teacherName} to say yes.</p>
          <p className="m-0 text-[15px] leading-[1.4] text-body">You asked to join {state.className}. Your own practice stays here the whole time.</p>
        </>
      ) : (
        <>
          <p className="m-0 text-[15px] leading-[1.4] text-body">{words.intro}</p>
          <JoinClassForm declined={state.declined} label={words.label} declinedNote={words.declined} />
        </>
      )}
    </section>
  )
}

/**
 * "Join your school class" (P112): a small card for a learner who signed up alone (a learner with a school class, a twin, and a grown-up's hand-over see
 * nothing). A code box and Send; after Send the card says "Waiting for {teacher} to say yes." until the teacher answers. It reads by the signed-in
 * learner's own login only, and never fails the page it sits on: if anything goes wrong the card is simply not drawn. It waits in a Suspense boundary, so
 * the page around it never waits for it. On the home the words keep to "class" (the learner's home does not speak of a school or a teacher before the
 * learner chooses to join one); on Me the card says it in full.
 */
export function JoinClassCard({ where }: { where: JoinPlace }) {
  return (
    <Suspense fallback={null}>
      <JoinClassCardContent where={where} />
    </Suspense>
  )
}
