import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { demoOn } from '@/lib/demo-switch'

/** The design kit is a page for building Jemma, not for the people who use it: local runs and the tests only (`demoOn`). */
export default function KitLayout({ children }: { children: ReactNode }) {
  if (!demoOn()) notFound()
  return children
}
