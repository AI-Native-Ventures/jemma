'use server'

import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { cleanCode, createLinkRequest, findClass as findClassByCode, type FoundClass } from '@/lib/data/p22'

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
  const result = await createLinkRequest(
    { userId, displayName: profile.display_name },
    {
      code,
      childName,
      consent: { guardian: form.get('guardian') === 'on', teach: form.get('teach') === 'on', improve: form.get('improve') === 'on' },
    },
  )
  if (!result.ok) {
    const q = new URLSearchParams({ code, child: childName, error: result.reason })
    redirect(`/p/add/consent?${q}`)
  }
  redirect('/p/add/pending')
}
