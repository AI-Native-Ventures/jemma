import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  EmptyState,
  Fraction,
  Handwriting,
  Headline,
  NeedsYouList,
  PaperCrop,
  Sidebar,
  SpaceHeader,
  StageTrack,
  TabBar,
  WhatJemmaDid,
} from '@/components/blocks'
import { KitErrorRetry, KitSheet } from './client'
import { Button, Card, Chip, ClockIcon, Field, Pill, ProgressDots, ReportIcon } from '@/components/ui'

export const metadata = { title: 'Jemma UI kit', robots: { index: false } }

function Frame({ title, children, width = 390 }: { title: string; children: ReactNode; width?: number }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 px-5 pt-6 text-[13px] font-semibold tracking-wider text-muted uppercase">{title}</h2>
      <div style={{ maxWidth: width }} className="mx-auto w-full overflow-hidden bg-ground">
        {children}
      </div>
    </section>
  )
}

const log = [
  { at: '14:12', text: 'Read 5 papers. 1 unsure, sent to you.' },
  { at: '14:13', text: 'Found 3 class gaps and the mistake behind each one' },
  { at: '14:13', text: 'Wrote a 10 minute reteach for adding fractions' },
  { at: '14:14', text: "Planned tonight's lesson for all 5 learners" },
]

const parentLog = [
  { at: '14:14', text: "Built tonight's 12-minute lesson on adding fractions, with fraction bars" },
  { at: '14:13', text: "Updated Amina's gaps: adding fractions is now her first focus" },
  { at: '14:12', text: "Marked Class Test 1 against Ms Banda's memo: 6 out of 10" },
  { at: 'Sun 18:40', text: 'Read the homework you snapped. 1 answer was too faint to be sure' },
]

/** Dev-only gallery of every kit component in its states. Not linked from the app. */
export default function KitPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <div className="pb-16">
      <h1 className="m-0 px-5 pt-5 text-[22px] font-bold">Jemma UI kit</h1>

      <Frame title="Teacher: header, headline, Needs you, What Jemma did, tab bar">
        <SpaceHeader
          name="6B Mathematics"
          subtitle="Grade 6 · Hillview Primary"
          switchHref="#"
          settingsHref="#"
          demo
          unread={1}
          settingsLabel="Class settings"
        />
        <div className="flex flex-col gap-5 px-5 pt-3.5 pb-5">
          <Headline action={{ href: '#', label: 'See the papers it comes from' }}>4 of 5 learners add the tops and the bottoms when adding fractions.</Headline>
          <NeedsYouList
            items={[
              {
                href: '#',
                title: "Check 1 answer on Sipho's paper",
                detail: 'Class Test 1 · question 7 · I read 0,8',
              },
            ]}
          />
          <WhatJemmaDid entries={log} seeAllHref="#" />
        </div>
        <TabBar role="teacher" active="class" label="Class" base="#" />
      </Frame>

      <Frame title="Parent: header, Needs you, What Jemma did, tab bar">
        <SpaceHeader
          name="Amina"
          subtitle="Grade 6 · Hillview Primary"
          switchHref="#"
          settingsHref="#"
          avatar="A"
          unread={1}
          settingsLabel="Amina's settings"
        />
        <div className="flex flex-col gap-5 px-5 pt-3.5 pb-5">
          <Headline note="Updated today at 14:13, after Class Test 1" action={{ href: '#', label: "See Amina's report" }}>
            Amina is doing well. One thing to work on this week: adding fractions.
          </Headline>
          <NeedsYouList
            items={[
              {
                href: '#',
                title: 'Check the homework you snapped',
                detail: "Sunday · 5 answers, 1 I'm unsure about",
                icon: 'check',
              },
            ]}
          />
          <WhatJemmaDid entries={parentLog} variant="parent" seeAllHref="#" />
        </div>
        <TabBar role="parent" active="profile" label="Amina" base="#" />
      </Frame>

      <Frame title="Learner: tab bar">
        <TabBar role="learner" active="today" label="Amina" base="#" />
        <TabBar role="learner" active="maths" label="Amina" base="#" />
      </Frame>

      <Frame title="Empty and error states">
        <div className="flex flex-col gap-5 px-5 py-3.5">
          <EmptyState />
          <KitErrorRetry />
        </div>
      </Frame>

      <Frame title="Stage track: cards (child) and arrows (parent)">
        <div className="flex flex-col gap-5 px-5 py-3.5">
          <StageTrack stage="new" />
          <StageTrack stage="practising" />
          <StageTrack stage="fixed" />
          <Card radius={20} className="gap-3.5 p-[18px]">
            <StageTrack stage="practising" variant="arrows" />
          </Card>
        </div>
      </Frame>

      <Frame title="Fraction, ProgressDots, Pill, Chip">
        <div className="flex flex-col gap-4 px-5 py-3.5">
          <span className="flex items-center gap-6 text-[20px]">
            <Fraction value="3/4" />
            <Fraction value="3 3/4" />
            <Fraction value="12" />
          </span>
          <span className="flex items-center gap-3 text-[14px] text-body">
            <ProgressDots filled={4} total={5} label="4 of 5 learners" />4 of 5 learners
          </span>
          <ProgressDots filled={3} total={5} shape="gem" label="3 gaps fixed of 5" />
          <span className="flex flex-wrap gap-2">
            <Pill icon={<ClockIcon />}>12 minutes</Pill>
            <Pill tone="coral">Demo</Pill>
            <Pill tone="ink">6/10</Pill>
            <Pill tone="danger">Down 30</Pill>
            <Pill tone="quiet">same</Pill>
          </span>
          <span className="flex flex-wrap gap-1.5">
            <Chip href="#" icon={<ReportIcon size={15} strokeWidth={1.9} />}>
              Class Test 1 · Q1, Q2, Q4
            </Chip>
          </span>
          <Card tone="ink" radius={22} className="gap-3 p-5">
            <Chip tone="onInk" href="#" icon={<ReportIcon size={15} strokeWidth={1.9} />}>
              Class Test 1 · Q8
            </Chip>
          </Card>
        </div>
      </Frame>

      <Frame title="Buttons, Field, Sheet">
        <div className="flex flex-col gap-3 px-5 py-3.5">
          <Button>Link Amina</Button>
          <Button variant="secondary">Retake the photo</Button>
          <Button variant="coral" size="xl">
            Start
          </Button>
          <Button size="lg">Done</Button>
          <Button variant="link">See my maths</Button>
          <Field label="Your child's name, as the school has it" defaultValue="Amina" />
          <Field label="Login code" error="That code is not right." defaultValue="K7Q2" />
          <KitSheet />
        </div>
      </Frame>

      <Frame title="Paper crop">
        <div className="px-5 py-3.5">
          <PaperCrop caption="Amina's marked paper">
            <span className="flex items-end gap-2 text-[11px]">
              Name{' '}
              <span className="flex-1 border-b border-[#777777] pl-1.5">
                <Handwriting>Amina</Handwriting>
              </span>
            </span>
          </PaperCrop>
        </div>
      </Frame>

      <Frame title="Sidebar (visible at 1024 wide and up)" width={1440}>
        <div className="flex min-h-[640px]">
          <Sidebar
            role="teacher"
            active="class"
            label="Class"
            name="6B Mathematics"
            subtitle="Grade 6 · Hillview Primary"
            switchHref="#"
            user={{ name: 'Ms Banda', initials: 'MB' }}
            settingsHref="#"
            unread={1}
            base="#"
          />
        </div>
      </Frame>
    </div>
  )
}
