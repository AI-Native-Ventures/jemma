import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: 'Jemma', robots: { index: false } }

/**
 * The saved tour of Jemma, Grade 11 Mathematics. No sign-in, no database, no AI: every page reads files that ship with the app, so it opens the same
 * way every time, with or without a connection to anything else. The learner's pages are /tour, and the teacher's are /tour/teacher.
 */
export default function TourLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh flex-col bg-ground font-sans leading-[normal]">{children}</div>
}
