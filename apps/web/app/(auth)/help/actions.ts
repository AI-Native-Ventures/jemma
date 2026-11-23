'use server'

import { checkMessage, FEEDBACK_BUCKET, feedbackPath, type MessageKind } from '@/lib/feedback'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'

export type SendResult = { ok: true } | { ok: false; message: string }

/**
 * Saves one message of the help form for the Jemma team: who sent it (when signed in), what about, the words and an email to write back to. The
 * private bucket is made the first time it is needed. Signed in or not, anyone may write (someone who cannot sign in needs this most).
 */
export async function sendHelpMessage(input: { kind: MessageKind; text: string; email: string; website: string }): Promise<SendResult> {
  const checked = checkMessage(input)
  if (!checked.ok) return checked
  if (checked.bot) return { ok: true }
  let sender: { id: string; role: string | null } | null = null
  try {
    const supabase = await createSupabaseServer()
    const { data } = await supabase.auth.getUser()
    if (data.user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', data.user.id).maybeSingle()
      sender = { id: data.user.id, role: profile?.role ?? null }
    }
  } catch {
    // Signed out, or the session could not be read: the message is still kept.
  }
  const now = new Date()
  const body = JSON.stringify({ sent_at: now.toISOString(), kind: checked.kind, text: checked.text, reply_to: checked.email, user_id: sender?.id ?? null, role: sender?.role ?? null }, null, 2)
  const admin = createSupabaseAdmin()
  const path = feedbackPath(now, crypto.randomUUID())
  const put = () => admin.storage.from(FEEDBACK_BUCKET).upload(path, new Blob([body], { type: 'application/json' }), { contentType: 'application/json', upsert: false })
  let { error } = await put()
  if (error && /not.?found/i.test(error.message)) {
    await admin.storage.createBucket(FEEDBACK_BUCKET, { public: false })
    ;({ error } = await put())
  }
  if (error) {
    console.error(`help message not saved: ${error.message}`)
    return { ok: false, message: 'That did not send. Try again in a minute.' }
  }
  return { ok: true }
}
