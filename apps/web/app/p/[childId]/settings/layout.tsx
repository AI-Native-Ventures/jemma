import type { ReactNode } from 'react'

/**
 * The boards draw settings full screen with their own back header, so on the phone this covers the
 * child space's header and tab bar. At laptop width the sidebar stays.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="max-lg:fixed max-lg:inset-0 max-lg:z-40 max-lg:overflow-y-auto max-lg:bg-ground">
      <div className="mx-auto flex min-h-dvh max-w-[440px] flex-col text-ink lg:min-h-0">{children}</div>
    </div>
  )
}
