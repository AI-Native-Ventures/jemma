'use client'

import { useId, useState } from 'react'

// P196: the formula sheet of a Grades 10 to 12 question about a 3D object with its sizes, from the "Grades 10 to 12" board ("Find the total surface area of the cone.
// Leave π in your answer."). A small green pill opens the formulas a learner has in a test, and closes them again.

const FORMULAS: { name: string; volume: string; area: string }[] = [
  { name: 'Rectangular prism', volume: 'V = l × b × h', area: 'A = 2(lb + lh + bh)' },
  { name: 'Cylinder', volume: 'V = πr²h', area: 'A = 2πr² + 2πrh' },
  { name: 'Cone', volume: 'V = ⅓πr²h', area: 'A = πr² + πrs' },
  { name: 'Sphere', volume: 'V = ⁴⁄₃πr³', area: 'A = 4πr²' },
  { name: 'Pyramid', volume: 'V = ⅓ × area of base × h', area: 'A = area of base + ½ × perimeter of base × slant height' },
]

export function FormulaSheet() {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div data-formula-sheet="" className="flex w-full flex-col items-end gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="rounded-pill bg-green-tint px-3 py-1.5 text-[13px] font-bold text-green"
      >
        {open ? 'Close the formula sheet' : 'Formula sheet'}
      </button>
      {open ? (
        <div id={id} className="w-full rounded-[16px] border border-line bg-[#F8F6F1] p-3.5">
          <p className="m-0 mb-2 text-[13px] text-body">s is the slant height, r the radius and h the height.</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {FORMULAS.map((f) => (
              <li key={f.name} className="flex flex-col gap-0.5">
                <span className="text-[14px] font-bold">{f.name}</span>
                <span className="text-[15px]">{f.volume}</span>
                <span className="text-[15px]">{f.area}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
