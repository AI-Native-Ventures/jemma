import { marksCsv } from '@/lib/data/p21'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const csv = await marksCsv(classId)
  return new Response(csv, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="marks.csv"' },
  })
}
