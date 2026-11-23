/**
 * Signing in with a 6 digit code by email needs an email sender. The live project has none of its own yet (Supabase's built-in one only reaches the
 * project team), so a code would never arrive: the link to it is shown only where codes can arrive. `JEMMA_EMAIL_CODES=1` turns it on (`./start.sh`
 * does, the local stack catches its emails); set it on the live app once an email sender is set up in Supabase. The tests run with it on.
 */
export function emailCodesOn(): boolean {
  return process.env.JEMMA_EMAIL_CODES === '1' || process.env.NODE_ENV === 'test'
}
