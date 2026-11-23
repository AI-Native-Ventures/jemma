import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { demoOn } from '@/lib/demo-switch'

/** The demo copy is for local runs and the tests only (`demoOn`). On the live app every page under /demo is not found. */
export default function DemoLayout({ children }: { children: ReactNode }) {
  if (!demoOn()) notFound()
  return children
}
