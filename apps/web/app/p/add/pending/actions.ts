'use server'

import { switchRole } from '@/lib/demo'

/** Demo only: the judge plays the teacher too, so this signs them in as Ms Banda in the same sandbox. */
export async function switchToTeacher(): Promise<void> {
  await switchRole('teacher')
}
