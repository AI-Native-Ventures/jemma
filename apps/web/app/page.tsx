import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { signedInDestination } from './_landing/destination'
import { LandingPage } from './_landing/LandingPage'

export const metadata: Metadata = {
  title: 'Jemma: follows one learner across years',
  description:
    'Jemma reads class tests from a photo, finds what each learner is missing, and gives them a short lesson to practise at home. For learners, parents and teachers.',
}

/** "/" is the landing page for a visitor. A signed-in person goes to their home, as after sign-in. */
export default async function Home() {
  const home = await signedInDestination()
  if (home) redirect(home)
  return <LandingPage />
}
