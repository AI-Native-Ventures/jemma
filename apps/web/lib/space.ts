import { headers } from 'next/headers'
import { TABS, type Role, type TabId } from '@/components/blocks/nav'

/** Tab to mark active for the current request, from the path `proxy.ts` forwards. Falls back to the first tab. */
export async function activeTab(role: Role, base: string): Promise<TabId> {
  const pathname = (await headers()).get('x-pathname') ?? base
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : ''
  const tabs = TABS[role]
  const match = tabs.find((tab) => tab.path !== '' && (rest === tab.path || rest.startsWith(`${tab.path}/`)))
  return (match ?? tabs[0]!).id
}
