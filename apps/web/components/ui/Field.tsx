import { useId } from 'react'
import type { ComponentProps } from 'react'

export type FieldProps = Omit<ComponentProps<'input'>, 'className'> & {
  label: string
  hint?: string
  error?: string
  className?: string
}

export function Field({ label, hint, error, id, className = '', ...input }: FieldProps) {
  const auto = useId()
  const inputId = id ?? auto
  const noteId = `${inputId}-note`
  const note = error ?? hint
  return (
    <div className={`flex flex-col leading-[normal] gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-[15px] font-medium">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        autoComplete="off"
        className={`h-[52px] rounded-14 border bg-card px-4 text-[17px] text-ink outline-none placeholder:text-muted-2 focus-visible:border-2 focus-visible:border-ink ${
          error ? 'border-coral-text' : 'border-muted-2'
        }`}
        {...input}
      />
      {note ? (
        <p id={noteId} className={`m-0 text-[14px] ${error ? 'text-coral-text' : 'text-body'}`}>
          {note}
        </p>
      ) : null}
    </div>
  )
}
