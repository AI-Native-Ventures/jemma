import { headers } from 'next/headers'
import { activeTabFor, type Role, type TabId } from '@/components/blocks/nav'

/**
 * Tab to mark active for the current request, from the path `proxy.ts` forwards: the first paint. The bars themselves read the address in the
 * browser (`usePathname`), because a layout is not drawn again when a child taps another tab. The choice is `activeTabFor`, shared with them.
 */
export async function activeTab(role: Role, base: string): Promise<TabId> {
  return activeTabFor(role, base, (await headers()).get('x-pathname') ?? base)
}
