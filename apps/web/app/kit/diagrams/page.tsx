import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { DiagramView } from '@/components/diagrams'

export const metadata = { title: 'Jemma diagram kit', robots: { index: false } }

const KINDS: { title: string; kind: string; note: string; spec: unknown }[] = [
  {
    title: 'Fraction bars',
    kind: 'fraction_bar',
    note: 'Comparing and adding fractions',
    spec: { kind: 'fraction_bar', rows: [{ parts: 1, shaded: 0 }, { parts: 2, shaded: 1 }, { parts: 4, shaded: 1 }] },
  },
  {
    title: 'Number line',
    kind: 'number_line',
    note: 'Fractions, decimals and counting on',
    spec: {
      kind: 'number_line',
      min: 0,
      max: 1,
      step: 0.25,
      marks: [{ value: 0.75, label: '3/4' }],
    },
  },
  { title: 'Area model', kind: 'area_model', note: 'Multiplication and area', spec: { kind: 'area_model', rows: 3, cols: 4, shaded: 12 } },
  {
    title: 'Place value chart',
    kind: 'place_value',
    note: 'Decimals and big numbers',
    spec: { kind: 'place_value', columns: ['Th', 'H', 'T', 'U', 't', 'h'], digits: ['', '', '', '0', '7', '5'] },
  },
  {
    title: 'Bar graph',
    kind: 'bar_chart',
    note: 'Data handling',
    spec: {
      kind: 'bar_chart',
      yMax: 15,
      bars: [{ label: 'Walk', value: 14 }, { label: 'Taxi', value: 9 }, { label: 'Car', value: 6 }, { label: 'Bus', value: 4 }],
    },
  },
  { title: '2D shapes', kind: 'shape_2d', note: 'Perimeter, area and properties of shapes', spec: { kind: 'shape_2d', shape: 'rectangle', labels: ['8 cm', '5 cm', 'Perimeter 26 cm'] } },
  { title: '2D shapes', kind: 'shape_2d', note: 'Right-angled triangle', spec: { kind: 'shape_2d', shape: 'triangle', labels: ['3 cm', '4 cm', '5 cm'] } },
  {
    title: 'Area on a grid',
    kind: 'grid_area',
    note: 'Area and perimeter by counting squares',
    spec: {
      kind: 'grid_area',
      cols: 12,
      rows: 6,
      cells: [[2, 1], [3, 1], [2, 2], [3, 2], ...[2, 3, 4, 5, 6].flatMap((c) => [[c, 3], [c, 4]])],
    },
  },
  { title: 'Square', kind: 'shape_2d', note: 'Side and caption', spec: { kind: 'shape_2d', shape: 'square', labels: ['4 cm', 'Perimeter 16 cm'] } },
  { title: 'Circle', kind: 'shape_2d', note: 'Radius and caption', spec: { kind: 'shape_2d', shape: 'circle', labels: ['r = 4 cm', 'Circumference = 2πr'] } },
  { title: 'Unknown kind', kind: 'hologram', note: 'Picture missing, never throws', spec: { kind: 'hologram' } },
]

const LEARN: { n: number; text: string; spec: unknown }[] = [
  { n: 1, text: 'A half and a quarter', spec: { kind: 'fraction_bar', rows: [{ parts: 2, shaded: 1 }, { parts: 4, shaded: 1 }] } },
  { n: 2, text: 'Cut the half into quarters. Same amount.', spec: { kind: 'fraction_bar', rows: [{ parts: 4, shaded: 2 }] } },
  { n: 3, text: 'Now add the quarters: 2 + 1 = 3', spec: { kind: 'fraction_bar', rows: [{ parts: 4, shaded: 3 }] } },
]

const QUESTION: { title: string; spec: unknown; highlight?: string[] }[] = [
  {
    title: 'Each square is 1 cm². What is the area of the shape?',
    spec: {
      kind: 'grid_area',
      cols: 8,
      rows: 5,
      cells: [[0, 1], [1, 1], [0, 2], [1, 2], ...[0, 1, 2, 3, 4].flatMap((c) => [[c, 3], [c, 4]])],
    },
  },
  {
    title: 'How many more learners walk than come by taxi?',
    highlight: ['Walk', 'Taxi'],
    spec: {
      kind: 'bar_chart',
      yMax: 16,
      bars: [{ label: 'Walk', value: 14 }, { label: 'Taxi', value: 9 }, { label: 'Car', value: 6 }, { label: 'Bus', value: 4 }],
    },
  },
]

const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="m-0 text-[24px] font-semibold tracking-[-0.01em]">{title}</h2>
      {children}
    </section>
  )
}

/** Dev-only gallery of every diagram kind. Not linked from the app. */
export default function DiagramKitPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <main className="mx-auto flex max-w-[1440px] flex-col gap-9 px-4 pt-6 pb-16 lg:px-12">
      <h1 className="m-0 text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] lg:text-[38px]">Diagram kit</h1>

      <Section title="Grade 1 to 7">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {KINDS.map((k, i) => (
            <article key={i} data-kind={k.kind} className="flex flex-col gap-3 rounded-20 border border-line bg-card p-[18px]">
              <div className="rounded-12 bg-card">
                <DiagramView spec={k.spec} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 text-[16px] font-semibold">{k.title}</h3>
                <code style={{ fontFamily: mono }} className="rounded-lg bg-soft-2 px-2 py-[3px] text-[12px] text-ink">
                  {k.kind}
                </code>
              </div>
              <p className="m-0 text-[14px] leading-[1.4] text-body">{k.note}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section title="Learn screen: fraction bars">
        <figure className="m-0 flex w-[350px] max-w-full flex-col gap-[14px] rounded-[24px] border border-line bg-card px-4 py-[18px]">
          {LEARN.map((s) => (
            <div key={s.n} className={`flex flex-col gap-2 ${s.n > 1 ? 'border-t border-dashed border-edge pt-[14px]' : ''}`}>
              <span className="flex gap-2 text-[15px] font-semibold">
                <span aria-hidden="true" className="flex size-[22px] flex-none items-center justify-center rounded-full bg-ink text-[12px] text-white">
                  {s.n}
                </span>
                {s.text}
              </span>
              <DiagramView spec={s.spec} variant="learn" />
            </div>
          ))}
        </figure>
      </Section>

      <Section title="Question styles">
        <div className="flex flex-wrap items-start gap-5">
          {QUESTION.map((q, i) => (
            <section key={i} aria-label="Question" className="flex w-[390px] max-w-full flex-col items-center gap-5 rounded-[28px] border border-line bg-card px-[14px] py-6">
              <h3 className="m-0 text-center text-[24px] leading-[1.3] font-bold text-balance">{q.title}</h3>
              <DiagramView spec={q.spec} variant="question" highlight={q.highlight} />
            </section>
          ))}
        </div>
      </Section>
    </main>
  )
}
