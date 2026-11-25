import { confirmedByPayfast, fromPayfast, itnSignatureOk, payfastEnv } from '@/lib/payfast'
import { handleNotice } from '@/lib/payfast-notice'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

// PayFast's payment notice (ITN, P161): PayFast posts here after each payment of a plan, and when a subscription is cancelled on their side. It is
// believed only when its signature is right and PayFast answers "VALID" for the same fields; where it came from is checked too, and logged when it
// does not match (PayFast's own "VALID" is the proof). PayFast wants a 200 back; anything else and it sends the notice again later.

export async function POST(request: Request): Promise<Response> {
  const env = payfastEnv()
  if (!env) return new Response('Payments are not set up.', { status: 503 })
  const entries = [...new URLSearchParams(await request.text()).entries()] as [string, string][]
  if (!itnSignatureOk(entries, env.passphrase)) {
    console.error('PayFast notice refused: the signature is wrong')
    return new Response('Bad signature', { status: 400 })
  }
  const [valid, known] = await Promise.all([confirmedByPayfast(entries, env.sandbox), fromPayfast(request.headers.get('cf-connecting-ip'))])
  if (!valid) {
    console.error('PayFast notice refused: PayFast did not say VALID')
    return new Response('Not valid', { status: 400 })
  }
  if (!known) console.error('PayFast notice: the address it came from is not one of PayFast\'s hosts (accepted, PayFast said VALID)')
  try {
    const result = await handleNotice(createSupabaseAdmin(), env, entries)
    console.log(`PayFast notice: ${'done' in result ? result.done : `ignored, ${result.ignored}`}`)
    return new Response('OK')
  } catch (e) {
    console.error(`PayFast notice not saved: ${e instanceof Error ? e.message : String(e)}`)
    return new Response('Not saved', { status: 500 })
  }
}
