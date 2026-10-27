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
  SunIcon,
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
  | 'today'
  | 'gaps'
  | 'me'

export type TabDef = { id: TabId; label: string; path: string; icon: (size: number) => ReactNode }

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
    { id: 'today', label: 'Today', path: '', icon: (s) => <SunIcon size={s} /> },
    { id: 'gaps', label: 'My gaps', path: '/gaps', icon: (s) => <GapsIcon size={s} /> },
    { id: 'me', label: 'Me', path: '/me', icon: (s) => <PersonIcon size={s} /> },
  ],
}

export const HOMES: Record<Role, string> = { teacher: '/t', parent: '/p', learner: '/k' }

export function tabHref(role: Role, tab: TabDef, base?: string): string {
  return `${base ?? HOMES[role]}${tab.path}` || '/'
}
