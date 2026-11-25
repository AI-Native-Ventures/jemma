import Link from 'next/link'
import { Wordmark } from '@/components/install'
import { BackLink, Gem, colors } from '../_parts'
import { keptTags, seenCountry } from '@/lib/request-facts'
import { cleanTag, defaultCountry } from '@/lib/signups'
import { SignUpForm } from './SignUpForm'

export const metadata = { title: 'Create an account · Jemma' }

/** The tags of the link a person came by (from an ad, or a link a person shared): kept with the sign-up, never sent anywhere. */
const TAGS = ['utm_source', 'utm_medium', 'utm_campaign'] as const

export default async function SignUpPage({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> } = {}) {
  const sp = (await searchParams) ?? {}
  // The tags in the address, else the ones Jemma kept from an earlier page of the same visit (TagKeeper's cookie).
  const kept = await keptTags()
  const tags: Record<string, string> = {}
  for (const k of TAGS) {
    const v = cleanTag(sp[k] ?? kept.get(k) ?? undefined)
    if (v) tags[k] = v
  }
  if (sp.ref) tags.landing = cleanTag(sp.ref) ?? ''
  const country = defaultCountry(await seenCountry())
  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 6px 8px' }}>
        <BackLink href="/sign-in" label="Back to sign in" />
        <Wordmark width={82} height={32} />
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22, padding: '18px 20px 28px', minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Gem />
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.18, fontWeight: 600, letterSpacing: '-0.015em', textWrap: 'pretty' }}>
              Make your Jemma account. It&apos;s free for families.
            </h1>
          </div>
          <p style={{ margin: '0 0 0 24px', fontSize: 15, lineHeight: 1.45, color: colors.body, textWrap: 'pretty' }}>
            For teachers, parents and learners. Got a code from a parent or teacher? Learners can sign in with it instead.
          </p>
        </div>

        <SignUpForm defaults={{ country, tags }} />

        <p style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '4px 8px', fontSize: 15, color: colors.body }}>
          Already have an account?
          <Link href="/sign-in" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontWeight: 600, color: colors.ink, textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Sign in
          </Link>
        </p>
        <div style={{ flex: 1 }} />
      </main>
    </>
  )
}
