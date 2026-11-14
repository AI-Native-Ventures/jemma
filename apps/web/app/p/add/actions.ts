'use server'

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { cleanCode, createLinkRequest, findClass as findClassByCode, type FoundClass } from '@/lib/data/p22'
import { addChildAlone as makeChildAlone, OwnWorkspaceError } from '@/lib/own-workspace'
import { COUNTRIES } from '@/lib/subjects'

/** The class a code belongs to, for the add-child card. Null when no class has the code. */
export async function findClass(code: string): Promise<FoundClass | null> {
  await requireRole('parent')
  return findClassByCode(code)
}

/** Parent ticked the boxes: record the request and wait for the teacher. Sends back to the consent page with a reason on a failure. */
export async function requestLink(form: FormData): Promise<void> {
  const { userId, profile } = await requireRole('parent')
  const code = cleanCode(String(form.get('code') ?? ''))
  const childName = String(form.get('child') ?? '')
  const surname = String(form.get('surname') ?? '')
  const result = await createLinkRequest(
    { userId, displayName: profile.display_name },
    {
      code,
      childName,
      surname,
      consent: { guardian: form.get('guardian') === 'on', teach: form.get('teach') === 'on', improve: form.get('improve') === 'on' },
    },
  )
  if (!result.ok) {
    const q = new URLSearchParams({ code, child: childName, surname, error: result.reason, ...(result.needsSurname ? { needsSurname: '1' } : {}) })
    redirect(`/p/add/consent?${q}`)
  }
  redirect('/p/add/pending')
}

export type AddAloneResult = { ok: false; message: string }

/**
 * "My child's school doesn't use Jemma" (P99): a signed-in parent adds a child with no school. The country must be one the app knows (the same list a
 * school is made with); the name and the grade are checked by the work itself, which refuses with one plain sentence. The personal school, the child, the
 * CAPS class of the grade and the parent's approved link are made, and the parent lands on the child's page. A parent may add more than one child this way.
 * The parent's own consent is the act of adding the child: no teacher says yes. Never throws to the screen except to send the parent on.
 */
export async function addChildAlone(input: { firstName: string; grade: number; country: string }): Promise<AddAloneResult> {
  const { userId } = await requireRole('parent')
  if (!COUNTRIES.some((c) => c.code === input.country)) return { ok: false, message: 'Pick the country.' }
  let childId: string
  try {
    childId = (await makeChildAlone({ parentId: userId, firstName: input.firstName, grade: input.grade, country: input.country })).childId
  } catch (e) {
    if (e instanceof OwnWorkspaceError) return { ok: false, message: e.message }
    console.error(`child not added: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, message: 'Could not add your child. Try again.' }
  }
  redirect(`/p/${childId}`)
}
