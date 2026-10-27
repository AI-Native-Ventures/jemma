import { CheckIcon } from '../ui/icons'

export type EmptyStateProps = {
  title?: string
  body?: string
}

/** The calm "nothing yet" card that stands where Needs you would be. */
export function EmptyState({
  title = 'Needs you',
  body = "Nothing yet. Things I'm unsure about land here.",
}: EmptyStateProps) {
  return (
    <section
      aria-labelledby="needs"
      className="flex items-center gap-3 leading-[normal] rounded-18 border border-line bg-card px-4 py-3.5"
    >
      <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-pill bg-soft-4">
        <CheckIcon size={18} />
      </span>
      <div className="flex flex-col gap-px">
        <h2 id="needs" className="m-0 text-[16px] font-semibold">
          {title}
        </h2>
        <p className="m-0 text-[14px] text-body">{body}</p>
      </div>
    </section>
  )
}
