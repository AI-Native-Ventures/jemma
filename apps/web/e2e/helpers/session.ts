import { createServerClient } from '@supabase/ssr'
import type { Page } from '@playwright/test'

type Cookie = { name: string; value: string }

/**
 * Signs in with Supabase and puts the same session cookies the server reads into the page's browser context.
 * Uses `@supabase/ssr` itself so the cookie names and chunking always match the app.
 */
export async function signInWithPassword(page: Page, email: string, password: string): Promise<void> {
  const jar = new Map<string, Cookie>()
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => [...jar.values()],
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, { name, value })),
    },
  })
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign in failed: ${error.message}`)

  const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000')
  await page.context().addCookies(
    [...jar.values()].map(({ name, value }) => ({
      name,
      value,
      domain: baseURL.hostname,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax' as const,
    })),
  )
}
