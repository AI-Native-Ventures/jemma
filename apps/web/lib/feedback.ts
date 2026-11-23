// The help form (P160): "Report a problem" and "Message the Jemma team". A message is one small JSON file in the private storage bucket `feedback`,
// a folder a day, so no table is needed and the owner reads them in Supabase under Storage. Pure: no browser, no database.

export const FEEDBACK_BUCKET = 'feedback'

export type MessageKind = 'problem' | 'message'

/** The longest message, in letters. */
export const MESSAGE_MAX = 2000

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

export type CheckedMessage = { ok: true; bot: boolean; kind: MessageKind; text: string; email: string | null } | { ok: false; message: string }

/**
 * Checks what the form sent. `website` is a field a person never sees: when it is filled a program filled it, so the message is thanked and dropped
 * (`bot`). The email is optional (to write back) and checked only for its shape.
 */
export function checkMessage(input: { kind: unknown; text: unknown; email?: unknown; website?: unknown }): CheckedMessage {
  const kind = input.kind === 'problem' || input.kind === 'message' ? input.kind : null
  if (!kind) return { ok: false, message: 'Pick what the message is about.' }
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  if (text.length < 3) return { ok: false, message: 'Write a few words first.' }
  if (text.length > MESSAGE_MAX) return { ok: false, message: `Keep it under ${MESSAGE_MAX} letters.` }
  const email = typeof input.email === 'string' ? input.email.trim() : ''
  if (email && (email.length > 254 || !EMAIL.test(email))) return { ok: false, message: 'That email address does not look right.' }
  const bot = typeof input.website === 'string' && input.website.trim() !== ''
  return { ok: true, bot, kind, text, email: email || null }
}

/** Where one message is kept: `2026-11-23/<id>.json`. */
export function feedbackPath(at: Date, id: string): string {
  return `${at.toISOString().slice(0, 10)}/${id}.json`
}
