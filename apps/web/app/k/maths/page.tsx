import type { Metadata } from 'next'
import { MyMaths, type MathsQuery } from '../MyMaths'

export const metadata: Metadata = { title: 'My maths' }
export const dynamic = 'force-dynamic'

/** The same page as /k (P128): the learner's one page, "My maths". Old links to /k/maths, and `?class=` and `?grade=` with them, keep working. */
export default async function MyMathsPage({ searchParams }: { searchParams?: Promise<MathsQuery> } = {}) {
  return MyMaths({ searchParams })
}
