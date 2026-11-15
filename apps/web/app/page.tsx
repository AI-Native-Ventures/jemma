import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { landingRedirectUrl, signedInDestination } from './_landing/destination'
import { LandingPage } from './_landing/LandingPage'

export const metadata: Metadata = {
  title: 'Jemma: follows one learner across years',
  description:
    'Jemma reads class tests from a photo, finds what each learner is missing, and gives them a short lesson to practise at home. For learners, parents and teachers.',
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
