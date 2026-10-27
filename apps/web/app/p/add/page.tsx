import { requireRole } from '@/lib/auth'
import { cleanCode, findClass } from '@/lib/data/p22'
import { AddChildForm } from './AddChildForm'
import { BackHeader, Main, Page } from './_parts'

export const metadata = { title: 'Add a child · Jemma' }

export default async function AddChildPage({ searchParams }: { searchParams: Promise<{ code?: string; child?: string; error?: string }> }) {
  await requireRole('parent')
  const q = await searchParams
  const code = cleanCode(q.code)
  const found = code ? await findClass(code) : null
  return (
    <Page>
      <BackHeader href="/p">
        <span style={{ fontSize: 17, fontWeight: 700 }}>Add a child</span>
      </BackHeader>
      <Main gap={20} padding="12px 20px 28px">
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.015em', textWrap: 'pretty' }}>
          Link your child with the teacher&apos;s class code
        </h1>
        <AddChildForm
          code={code}
          child={q.child ?? ''}
          error={q.error ?? null}
          found={found && { className: found.className, teacherName: found.teacherName, grade: found.grade, schoolName: found.schoolName }}
        />
      </Main>
    </Page>
  )
}
