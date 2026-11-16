import { joinCardFor } from '@/lib/class-join'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { JoinClassForm } from './JoinClassForm'

const card = 'flex flex-col gap-3 rounded-20 border border-line bg-card p-4'

/**
 * "Join your school class": a small card for a learner who signed up alone (a learner with a school class, a twin, and a grown-up's hand-over see
 * nothing). A code box and Send; after Send the card says "Waiting for {teacher} to say yes." until the teacher answers. It reads by the signed-in
 * learner's own login only, and never fails the page it sits on: if anything goes wrong the card is simply not drawn.
 */
export async function JoinClassCard() {
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
        Join your school class
      </h2>
      {state.kind === 'waiting' ? (
        <>
          <p className="m-0 text-[17px] leading-[1.4] font-semibold">Waiting for {state.teacherName} to say yes.</p>
          <p className="m-0 text-[15px] leading-[1.4] text-body">You asked to join {state.className}. Your own practice stays here the whole time.</p>
        </>
      ) : (
        <>
          <p className="m-0 text-[15px] leading-[1.4] text-body">Type your teacher&apos;s class code. When your teacher says yes, you get My school beside My own.</p>
          <JoinClassForm declined={state.declined} />
        </>
      )}
    </section>
  )
}
