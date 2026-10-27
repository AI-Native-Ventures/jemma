import type { ReactNode } from 'react'

/**
 * Full-screen frame for the boards that have their own top bar (handover, session result).
 * On the phone it covers the child space's header and tab bar; from 1024 it sits in the content column beside the sidebar.
 */
export function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ground leading-[normal] lg:static lg:z-auto lg:overflow-visible">
      {children}
    </div>
  )
}
