'use client'

import { ErrorRecovery, type ErrorScreenProps } from '@/components/ErrorRecovery'

/** The error screen of the saved tour (home: /tour). A failed refresh or a lost connection tries again by itself, then shows a calm card (P152, see ErrorRecovery). */
export default function TourError(props: ErrorScreenProps) {
  return <ErrorRecovery {...props} home="/tour" />
}
