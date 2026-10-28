import { createSupabaseServer } from '@/lib/supabase/server'
import { BackHeader, Column, Title } from '../../../_p21'
import { PairDesktopRow, RemoveDesktopButton, RunnerChoice } from './RunnerClient'

export const dynamic = 'force-dynamic'

const TZ = 'Africa/Johannesburg'
const READY_MS = 2 * 60_000
const AGENT = { claude: 'Claude Code', codex: 'Codex' } as const

const pairedOn = (iso: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('weekday')} ${get('day')} ${get('month')}`
}

/** "Where Jemma's AI runs": cloud or the teacher's own Jemma Desktop, and the desktops paired to the account. */
export default async function AiRunnerPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params
  const supabase = await createSupabaseServer()
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user!.id
  const [{ data: cls }, { data: profile }, { data: desktops }] = await Promise.all([
    supabase.from('classes').select('name, school_id').eq('id', classId).single(),
    supabase.from('profiles').select('display_name').eq('user_id', userId).maybeSingle(),
    supabase.from('runner_presence').select('runner_id, created_at, chosen, last_seen').eq('user_id', userId).order('created_at'),
  ])
  const { data: school } = await supabase.from('schools').select('ai_runner').eq('id', cls!.school_id).single()
  const runner = school?.ai_runner ?? 'cloud'
  const owner = profile?.display_name ?? 'My'
  const nameOf = () => (profile?.display_name ? `${owner}'s MacBook` : 'My MacBook')
  const live = (desktops ?? []).find((d) => Date.now() - new Date(d.last_seen).getTime() < READY_MS)
  const first = desktops?.[0]
  const agent = (live ?? first)?.chosen
  const desktopLine = first ? `${nameOf()} · ${agent && agent in AGENT ? AGENT[agent as keyof typeof AGENT] : 'No AI chosen'} · ${live ? 'Ready' : 'Not running'}` : null

  return (
    <Column bare>
      <BackHeader href={`/t/${classId}/settings`} label="Back to class settings" sub={cls!.name} title="Where Jemma's AI runs" />
      <main className="flex flex-1 flex-col gap-4 px-5 pt-3 pb-7">
        <div className="flex flex-col gap-2">
          <Title size={25}>Jemma&apos;s AI runs on {runner === 'desktop' ? 'your MacBook' : 'the Jemma cloud'}.</Title>
          <p className="m-0 ml-6 text-[15px] leading-[1.45] text-body text-pretty">
            This is where Jemma reads papers and writes lessons. You still snap tests on your phone.
          </p>
        </div>

        <RunnerChoice runner={runner} desktopLine={desktopLine} />

        <p className="m-0 flex gap-2.5 text-[14px] leading-[1.45] text-body">
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="mt-1 flex-none">
            <polygon points="8,0.5 15.5,8 8,15.5 0.5,8" fill="#FF6A4D" />
          </svg>
          If your MacBook is off, Jemma asks you in Needs you before it uses the cloud.
        </p>

        <section aria-labelledby="desk" className="flex flex-col gap-0.5 rounded-20 border border-line bg-card px-4 pt-4 pb-1.5">
          <h2 id="desk" className="m-0 text-[17px] font-semibold">
            Desktops
          </h2>
          {(desktops ?? []).map((d) => (
            <div key={d.runner_id} className="flex min-h-16 items-center gap-3 py-1.5">
              <span aria-hidden="true" className="flex size-[38px] flex-none items-center justify-center rounded-12 bg-soft-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F1D36" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="5" width="14" height="10" rx="1.5" />
                  <path d="M3 18.5h18" />
                </svg>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-px leading-[1.35]">
                <span className="text-[16px] font-semibold">{nameOf()}</span>
                <span className="text-[13px] text-body">Paired {pairedOn(d.created_at)}</span>
              </span>
              <RemoveDesktopButton runnerId={d.runner_id} name={nameOf()} />
            </div>
          ))}
          <PairDesktopRow />
        </section>

        <p className="m-0 flex gap-2.5 text-[13px] leading-[1.45] text-body">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5D5A73" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px flex-none">
            <path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z" />
          </svg>
          Your Claude or ChatGPT plan may use what it sees to improve its models unless you turn that off in its settings. Jemma only sends schoolwork.
        </p>
        <div className="flex-1" />
      </main>
    </Column>
  )
}
