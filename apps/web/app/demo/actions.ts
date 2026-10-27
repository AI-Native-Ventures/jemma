'use server'

import { isDemoRole, resetDemo, switchRole, tryDemo } from '@/lib/demo'

export async function tryDemoAction(formData: FormData): Promise<void> {
  const role = formData.get('role')
  await tryDemo(isDemoRole(role) ? role : 'teacher')
}

export async function switchRoleAction(formData: FormData): Promise<void> {
  const role = formData.get('role')
  if (!isDemoRole(role)) throw new Error('Unknown role')
  await switchRole(role)
}

export async function resetDemoAction(): Promise<void> {
  await resetDemo()
}
