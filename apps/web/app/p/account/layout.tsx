import type { ReactNode } from 'react'
import { ParentFrame } from './_frame'

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <ParentFrame>{children}</ParentFrame>
}
