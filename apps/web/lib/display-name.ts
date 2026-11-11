/**
 * The name a new profile gets: the name typed at sign-up (the sign-in service keeps it as `full_name`), else the part of the
 * email before the @, else "New user". Plain text of at most 80 characters.
 */
export function displayNameFor(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }): string {
  const typed = user.user_metadata?.full_name
  const name = typeof typed === 'string' ? typed.trim().replace(/\s+/g, ' ').slice(0, 80) : ''
  return name || (user.email ?? '').split('@')[0] || 'New user'
}
