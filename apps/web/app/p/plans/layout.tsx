import type { ReactNode } from 'react'
import { ParentFrame } from '../account/_frame'

export default function PlansLayout({ children }: { children: ReactNode }) {
  return <ParentFrame>{children}</ParentFrame>
}
