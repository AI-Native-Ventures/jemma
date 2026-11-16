'use client'

import { TRUE_FALSE_LABELS } from '@jemma/profiling/logic'

/**
 * A true or false question (P149): two big buttons of the same size, True and False, neither pushed. What is sent is the word on the button, so the server
 * marks it as `true` or `false` against the key.
 */
export function TrueFalse({ picked, onPick, warm = false }: { picked: string | null; onPick: (word: string) => void; warm?: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-3.5">
      <div role="group" aria-label="True or false" className="grid w-full grid-cols-2 gap-3">
        {TRUE_FALSE_LABELS.map((word) => {
          const on = picked === word
          return (
            <button
              key={word}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(word)}
              className={`flex min-h-[96px] cursor-pointer items-center justify-center rounded-[22px] px-5 py-3 text-center text-balance ${warm ? 'text-[30px]' : 'text-[28px]'} font-bold ${
                on ? 'border-[3px] border-ink bg-ink text-white' : 'border-2 border-edge bg-card text-ink'
              }`}
            >
              {word}
            </button>
          )
        })}
      </div>
      <p className="m-0 text-center text-[16px] leading-[1.4] text-body">Tap True or False.</p>
    </div>
  )
}
