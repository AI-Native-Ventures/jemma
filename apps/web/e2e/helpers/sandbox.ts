import { createServiceClient } from '@jemma/profiling/db'
import type { Page } from '@playwright/test'
import { createSandbox, deleteSandbox, type SandboxStage } from '../../../../supabase/seed/demo'
import { signInWithPassword } from './session'

export type SandboxRole = 'teacher' | 'parent' | 'learner'

export type OpenedSandbox = {
  sandboxId: string
  classId: string
  childId: string
  joinCode: string
  /** Deletes the sandbox's school, users and files. Call it in afterEach or afterAll. */
  cleanup(): Promise<void>
}

type StoredLogins = Record<SandboxRole, { email: string; password: string }>

const admin = () =>
  createServiceClient({
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  })

/**
 * Makes a seeded demo school at `stage`, signs the page in as `role` and sets the `jemma_demo` cookie,
 * so the page behaves as if the judge had pressed "Try the demo". Does not navigate.
 */
export async function openSandbox(
  page: Page,
  { stage, role }: { stage: SandboxStage; role: SandboxRole },
): Promise<OpenedSandbox> {
  const db = admin()
  const sandbox = await createSandbox(db, { stage })
  const cleanup = () => deleteSandbox(db, sandbox.sandboxId)
  try {
    const { data, error } = await db.from('demo_sandboxes').select('logins').eq('id', sandbox.sandboxId).single()
    if (error) throw new Error(`openSandbox: ${error.message}`)
    const login = (data.logins as StoredLogins)[role]
    const { data: child, error: childError } = await db
      .from('children')
      .select('id')
      .eq('school_id', sandbox.schoolId)
      .eq('first_name', 'Amina')
      .single()
    if (childError) throw new Error(`openSandbox: ${childError.message}`)

    await signInWithPassword(page, login.email, login.password)
    const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000')
    await page.context().addCookies([
      { name: 'jemma_demo', value: sandbox.sandboxId, domain: baseURL.hostname, path: '/', httpOnly: true, secure: false, sameSite: 'Lax' },
    ])
    return { sandboxId: sandbox.sandboxId, classId: sandbox.classId, childId: child.id, joinCode: sandbox.joinCode, cleanup }
  } catch (e) {
    await cleanup().catch(() => undefined)
    throw e
  }
}
