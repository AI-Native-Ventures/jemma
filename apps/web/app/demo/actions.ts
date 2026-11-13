'use server'

import { isDemoRole, parsePerson, resetDemo, switchRole, tryDemo } from '@/lib/demo'

/**
 * The three big buttons post `role`. A person under "More people at Hillview" posts `person` (`teacher:dlamini`). "Start from an
 * empty school" posts `start=empty`.
 */
export async function tryDemoAction(formData: FormData): Promise<void> {
  if (formData.get('start') === 'empty') await tryDemo('teacher', { kind: 'empty' })
  const role = formData.get('role')
  const person = parsePerson(formData.get('person'))
  await tryDemo(isDemoRole(role) ? role : (person?.kind ?? 'teacher'), { person })
}

export async function switchRoleAction(formData: FormData): Promise<void> {
  const person = parsePerson(formData.get('person'))
  if (person) await switchRole(person.kind, person)
  const role = formData.get('role')
  if (!isDemoRole(role)) throw new Error('Unknown role')
  await switchRole(role)
}

export async function resetDemoAction(): Promise<void> {
  await resetDemo()
}
