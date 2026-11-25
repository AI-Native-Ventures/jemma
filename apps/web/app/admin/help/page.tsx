import { latestHelp } from '@/lib/data/admin'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { AdminShell, Empty, PageHeader } from '../_parts'

export const metadata = { title: 'Help messages · Jemma admin' }

/** P161: the help messages of the last 14 days, newest first, with the email to answer when the person gave one. */
export default async function AdminHelp() {
  const messages = await latestHelp(createSupabaseAdmin(), 100)
  return (
    <AdminShell active="help">
      <PageHeader title="Help messages" />
      <section className="flex flex-col rounded-20 border border-line bg-card p-5">
        {messages.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {messages.map((m, i) => (
              <li key={`${m.at}-${i}`} className={`flex flex-col gap-1.5 py-4 ${i > 0 ? 'border-t border-soft' : 'pt-0'}`}>
                <span className="flex flex-wrap justify-between gap-2 text-[13px]">
                  <span className="font-bold">
                    {m.kind}
                    {m.role ? ` · ${m.role}` : ''}
                  </span>
                  <span className="text-body">{new Date(m.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </span>
                <span className="text-[16px] leading-[1.45] whitespace-pre-wrap">{m.text}</span>
                {m.replyTo ? (
                  <a href={`mailto:${m.replyTo}`} className="text-[14px] font-semibold text-ink underline underline-offset-[3px]">
                    Answer {m.replyTo}
                  </a>
                ) : (
                  <span className="text-[14px] text-body">No email to answer.</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No messages in the last 14 days.</Empty>
        )}
      </section>
    </AdminShell>
  )
}
