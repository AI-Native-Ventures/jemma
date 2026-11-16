import type { Metadata } from 'next'
import { MyMaths, type MathsQuery } from './MyMaths'

export const metadata: Metadata = { title: 'My maths' }
export const dynamic = 'force-dynamic'

/** The learner's home is My maths (P128): the address /k and the address /k/maths draw the same page, so every way back to /k lands on it. */
export default async function LearnerHome({ searchParams }: { searchParams?: Promise<MathsQuery> } = {}) {
  return MyMaths({ searchParams })
}
