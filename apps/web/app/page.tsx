import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { landingRedirectUrl, signedInDestination } from './_landing/destination'
import { LandingPage } from './_landing/LandingPage'

export const metadata: Metadata = {
  title: 'Jemma: learn maths until you understand it',
  description: 'Jemma teaches you a short lesson, marks your answers, and teaches again what you got wrong. Every lesson is free.',
}

/**
 * "/" is the front door. A signed-in person goes to their home, as after sign-in. A visitor goes to the landing site when LANDING_URL is set
 * (production: its own small site). Without LANDING_URL (local runs, CI) the built-in landing page is shown.
 */
export default async function Home() {
  const home = await signedInDestination()
  if (home) redirect(home)
  const landing = landingRedirectUrl(process.env.LANDING_URL)
  if (landing) redirect(landing)
  return <LandingPage />
}
