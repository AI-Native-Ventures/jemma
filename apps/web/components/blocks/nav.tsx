import type { ReactNode } from 'react'
import {
  BookIcon,
  CameraIcon,
  ClipboardIcon,
  GapsIcon,
  HomeIcon,
  LayersIcon,
  PeopleIcon,
  PersonIcon,
} from '../ui/icons'

export type Role = 'teacher' | 'parent' | 'learner'

export type TabId =
  | 'class'
  | 'learners'
  | 'snap'
  | 'tests'
  | 'curriculum'
  | 'profile'
  | 'learn'
  | 'maths'
  | 'me'

/** `phoneOnly`: a tab of the phone's bottom bar that the laptop sidebar does not list (the sidebar has Settings, at the bottom, for it). */
export type TabDef = { id: TabId; label: string; path: string; icon: (size: number) => ReactNode; phoneOnly?: boolean }

/** Tab order is the contract: Snap sits in the centre for teacher and parent. */
export const TABS: Record<Role, TabDef[]> = {
  teacher: [
    { id: 'class', label: 'Class', path: '', icon: (s) => <HomeIcon size={s} /> },
    { id: 'learners', label: 'Learners', path: '/learners', icon: (s) => <PeopleIcon size={s} /> },
    { id: 'snap', label: 'Snap', path: '/snap', icon: (s) => <CameraIcon size={s} /> },
    { id: 'tests', label: 'Tests', path: '/tests', icon: (s) => <ClipboardIcon size={s} /> },
    { id: 'curriculum', label: 'Curriculum', path: '/curriculum', icon: (s) => <LayersIcon size={s} /> },
  ],
  parent: [
    { id: 'profile', label: 'Profile', path: '', icon: (s) => <PersonIcon size={s} /> },
    { id: 'learn', label: 'Learn', path: '/learn', icon: (s) => <BookIcon size={s} /> },
    { id: 'snap', label: 'Snap', path: '/snap', icon: (s) => <CameraIcon size={s} /> },
    { id: 'tests', label: 'Tests', path: '/tests', icon: (s) => <ClipboardIcon size={s} /> },
  ],
  learner: [
    // P128: the learner's one main page. My maths lives at /k (and /k/maths is the same page), so its tab is the first one: an address with no tab of its
    // own folder (the home, /k/maths and every screen below it, /k/own, /k/upload) marks it.
    { id: 'maths', label: 'My maths', path: '', icon: (s) => <GapsIcon size={s} /> },
    // Me is the learner's own page (/k/me): the phone reaches it from the bar, the laptop from the gear in the sidebar.
    { id: 'me', label: 'Me', path: '/me', icon: (s) => <PersonIcon size={s} />, phoneOnly: true },
  ],
}

export const HOMES: Record<Role, string> = { teacher: '/t', parent: '/p', learner: '/k' }

/** Screens outside a tab's own folder that the boards show under that tab. */
const ALIASES: Record<Role, Record<string, TabId>> = {
  teacher: { '/register': 'learners' },
  // A marked paper is a test, a session is a lesson: the screens a parent opens from the Tests and the Learn tab (they draw their own bar with that tab marked).
  parent: { '/papers': 'tests', '/sessions': 'learn' },
  learner: {},
}

const trimEnd = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path)
const inside = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`)

/** Is `pathname` the space at `base` or a screen inside it? */
export function isInSpace(base: string, pathname: string): boolean {
  return inside(trimEnd(pathname), trimEnd(base))
}

/**
 * The tab to mark for an address: the tab whose folder the address is in, the tab an alias names, else the first tab. A pure function of
 * (role, base, pathname), used by the server for the first paint and by the bar in the browser (`usePathname`), so a tap on another tab moves the mark
 * at once, without a new page from the server.
 */
export function activeTabFor(role: Role, base: string, pathname: string): TabId {
  const tabs = TABS[role]
  const root = trimEnd(base)
  const full = trimEnd(pathname)
  const rest = inside(full, root) ? full.slice(root.length) : ''
  const alias = Object.entries(ALIASES[role]).find(([path]) => inside(rest, path))
  if (alias) return alias[1]
  const match = tabs.find((tab) => tab.path !== '' && inside(rest, tab.path))
  return (match ?? tabs[0]!).id
}

/** The tab a bar marks: the one for the address it is in, or `first` (what the server passed) where the address cannot be read or is not in the space. */
export function markedTab(role: Role, base: string, pathname: string | null, first: TabId): TabId {
  return pathname !== null && isInSpace(base, pathname) ? activeTabFor(role, base, pathname) : first
}

export function tabHref(role: Role, tab: TabDef, base?: string): string {
  return `${base ?? HOMES[role]}${tab.path}` || '/'
}
