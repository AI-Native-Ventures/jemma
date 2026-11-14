import { isOwnRecord } from '@jemma/profiling/own-names'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { myChild } from '@/lib/data/p27'
import { Back, Shell } from '../Screens'
import { SnapTest } from './SnapTest'

export const metadata: Metadata = { title: 'A marked test' }
export const dynamic = 'force-dynamic'

/** The camera screen of a marked test. Only in My own: a learner in My school is sent to "Add your own work", which says to switch. */
export default async function SnapTestPage() {
  const { child } = await myChild()
  if (!isOwnRecord(child)) redirect('/k/own')
  return (
    <Shell firstName={child.first_name}>
      <Back href="/k/own">Add your own work</Back>
      <SnapTest />
    </Shell>
  )
}
