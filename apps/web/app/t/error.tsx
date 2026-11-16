'use client'

import { ErrorRecovery, type ErrorScreenProps } from '@/components/ErrorRecovery'

/** The error screen of the teacher's part of the app (home: /t). A failed refresh or a lost connection tries again by itself, then shows a calm card (P152, see ErrorRecovery). */
export default function TeacherError(props: ErrorScreenProps) {
  return <ErrorRecovery {...props} home="/t" />
}
