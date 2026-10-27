import { headers } from 'next/headers'
import { TABS, type Role, type TabId } from '@/components/blocks/nav'

/** Screens outside a tab's own folder that the boards show under that tab. */
const ALIASES: Record<Role, Record<string, TabId>> = {
  teacher: { '/register': 'learners' },
  parent: {},
  learner: {},
}

/** Tab to mark active for the current request, from the path `proxy.ts` forwards. Falls back to the first tab. */
export async function activeTab(role: Role, base: string): Promise<TabId> {
  const pathname = (await headers()).get('x-pathname') ?? base
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : ''
  const tabs = TABS[role]
  const alias = Object.entries(ALIASES[role]).find(([path]) => rest === path || rest.startsWith(`${path}/`))
  if (alias) return alias[1]
  const match = tabs.find((tab) => tab.path !== '' && (rest === tab.path || rest.startsWith(`${tab.path}/`)))
  return (match ?? tabs[0]!).id
}
