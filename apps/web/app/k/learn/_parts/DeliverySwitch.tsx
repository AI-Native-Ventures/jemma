'use client'

import { DELIVERIES, DELIVERY_LABEL, type Delivery } from './delivery'

/**
 * Read, Pictures or Listen: how the lesson is shown. The same lesson in all three (the pictures stay in Listen, the words stay in Pictures), so this is a
 * choice of what comes first, never of what is left out. The choice is kept on the device by the reader.
 */
export function DeliverySwitch({ value, onChange }: { value: Delivery; onChange: (delivery: Delivery) => void }) {
  return (
    <div role="radiogroup" aria-label="How you want to learn" className="flex w-full gap-1 rounded-14 bg-soft p-1">
      {DELIVERIES.map((d) => {
        const on = value === d
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(d)}
            className={`flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-12 border-0 px-3 text-[15px] font-semibold ${on ? 'bg-green text-white' : 'bg-transparent text-ink'}`}
          >
            {DELIVERY_LABEL[d]}
          </button>
        )
      })}
    </div>
  )
}
