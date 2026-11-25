import type { ReactNode } from 'react'
import { requireAdmin } from '@/lib/admin'

export const metadata = { title: 'Jemma admin', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/** P161: the owner's pages. Only the emails in JEMMA_ADMIN_EMAILS open them; everyone else gets "not found". */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
