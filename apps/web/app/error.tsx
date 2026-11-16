'use client'

import { ErrorRecovery, type ErrorScreenProps } from '@/components/ErrorRecovery'

/**
 * The error screen for everything that has none of its own: the sign-in pages, the demo, and a failure in the learner layout itself (a layout's error is
 * not caught by the `error.tsx` beside it, but by the one above). Home is read from the address (P152, see ErrorRecovery).
 */
export default function AppError(props: ErrorScreenProps) {
  return <ErrorRecovery {...props} />
}
