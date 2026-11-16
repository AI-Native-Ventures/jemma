'use client'

import { ErrorRecovery, type ErrorScreenProps } from '@/components/ErrorRecovery'

/** The error screen of the parent's part of the app (home: /p). A failed refresh or a lost connection tries again by itself, then shows a calm card (P152, see ErrorRecovery). */
export default function ParentError(props: ErrorScreenProps) {
  return <ErrorRecovery {...props} home="/p" />
}
