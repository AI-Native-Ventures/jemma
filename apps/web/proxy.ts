import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@jemma/profiling/db'
import { HANDOVER_COOKIE, handoverAllows } from '@/lib/handover'
import { isPublicPath } from '@/lib/public-paths'
import { supabaseEnv } from '@/lib/supabase/env'

const HOMES = { teacher: '/t', parent: '/p', learner: '/k' } as const

/** The space a path belongs to: `/t`, `/p` or `/k`. */
function spaceOf(pathname: string): string {
  return `/${pathname.split('/')[1]}`
}

/**
 * Refreshes the Supabase session cookies and does the cheap redirects (signed out, wrong space).
 * The layouts call `requireRole` as the real check. Also forwards the path as `x-pathname` so layouts can mark the active tab.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const forwarded = () => {
    const headers = new Headers(request.headers)
    headers.set('x-pathname', pathname)
    return headers
  }
  let response = NextResponse.next({ request: { headers: forwarded() } })
  const { url, anonKey } = supabaseEnv()
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value)
        response = NextResponse.next({ request: { headers: forwarded() } })
        for (const { name, value, options } of list) response.cookies.set(name, value, options)
      },
    },
  })

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url))
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
    return redirect
  }

  const { data } = await supabase.auth.getUser()
  if (!data.user) return isPublicPath(pathname) ? response : redirectTo('/sign-in')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', data.user.id).maybeSingle()
  if (!profile) return redirectTo('/role')
  const home = HOMES[profile.role]
  // A parent who handed the phone over may open that one session and the hand-back screen.
  if (profile.role === 'parent' && spaceOf(pathname) === '/k' && (await handoverAllows(request.cookies.get(HANDOVER_COOKIE)?.value, pathname))) {
    return response
  }
  if (spaceOf(pathname) !== home) return redirectTo(home)
  return response
}

export const config = { matcher: ['/t/:path*', '/p/:path*', '/k/:path*'] }
