import type { Metadata } from 'next'
import { getOwnHome } from '@/lib/data/own-uploads'
import { NotOwnScreen, OwnHomeScreen } from './Screens'

export const metadata: Metadata = { title: 'Add your own work' }
export const dynamic = 'force-dynamic'

/**
 * "Add your own work": a learner adds a photo of a test they got back marked, or their own curriculum. Only in My own: a learner who is in My
 * school reads one line and has the switch (nothing can be added to the school's record from here).
 */
export default async function AddOwnWorkPage() {
  const home = await getOwnHome()
  if (home.workspace === 'school') return <NotOwnScreen firstName={home.firstName} />
  return <OwnHomeScreen firstName={home.firstName} tests={home.tests} curricula={home.curricula} alone={home.alone} />
}
