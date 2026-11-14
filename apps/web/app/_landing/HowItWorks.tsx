const STEPS = [
  { title: 'A teacher snaps a class test.', detail: "One photo for each page, taken with the phone's camera." },
  { title: 'Jemma reads it, code marks it, and finds the gaps.', detail: 'A model reads the photo. Code does the marking. Anything Jemma is unsure about goes to the teacher.' },
  { title: 'Each learner gets a short lesson for tonight, on screen or on paper.', detail: 'Learners answer on the screen, or write on paper and send one photo.' },
] as const

/** Three steps, from the class test to tonight's lesson, and the one line about what Jemma teaches. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-title">
      <div className="mx-auto w-full max-w-[1120px] px-5 py-10 lg:px-10 lg:py-14">
        <h2 id="how-title" className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.01em] lg:text-[36px]">
          How it works
        </h2>
        <ol className="m-0 mt-6 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-3 lg:gap-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex min-w-0 items-start gap-4 rounded-20 border border-line bg-card p-5 lg:flex-col lg:gap-4">
              <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-pill bg-ink text-[15px] font-semibold text-white">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <h3 className="m-0 text-[18px] leading-[1.3] font-semibold text-pretty">{step.title}</h3>
                <p className="m-0 text-[15px] leading-[1.45] text-body text-pretty">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="m-0 mt-5 text-[15px] leading-[1.45] text-body text-pretty">
          Jemma teaches Mathematics for Grades 1 to 12, with the South African CAPS curriculum built in.
        </p>
      </div>
    </section>
  )
}
