import Link from 'next/link'
import { LegalPage, type LegalSection } from '../../_legal'

export const metadata = { title: 'Privacy policy · Jemma' }

const link = { color: '#161616', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 } as const

// Written from what the app does (P160). When the app changes what it keeps, who sees it or where it goes, this page changes with it.
const SECTIONS: LegalSection[] = [
  {
    id: 'who',
    title: 'Who we are',
    body: [
      'Jemma is a maths learning app for learners, parents and teachers. It is made by AI Native Ventures in South Africa. Under the Protection of Personal Information Act (POPIA), we are the responsible party for the information Jemma keeps.',
      <>
        To ask us anything about your information, open <Link href="/help" style={link}>Help</Link> and tap Message the Jemma team.
      </>,
    ],
  },
  {
    id: 'keeps',
    title: 'What Jemma keeps',
    body: [
      'For every account: a name, an email address, the role (learner, parent or teacher) and a password. The password is kept by our sign-in service in a form nobody can read back.',
      'For a learner: the first name, the grade, the school and class when there is one, and their work. Their work is their answers, marks, lessons, how long they practised and which ways of learning helped them.',
      'Photos of written work: class tests a teacher snaps, and homework a parent or learner snaps. Teachers also upload their curriculum documents and past records, and keep notes and attendance.',
      'Messages you send us with the help form. The cookies that keep you signed in.',
      'Jemma has no adverts and never sells information.',
    ],
  },
  {
    id: 'why',
    title: 'Why Jemma keeps it',
    body: [
      'To teach maths: to write lessons and practice, mark answers and photos, and teach again what was missed.',
      'To show progress to the people who may see it, and to keep accounts safe.',
      "To improve Jemma only when a parent turns on Use my child's work, name removed, to improve Jemma. It is off unless the parent turns it on.",
    ],
  },
  {
    id: 'sees',
    title: 'Who sees what',
    body: [
      'A learner sees their own work. A teacher sees the learners in their own classes. A parent sees their own child, once the teacher says yes to the link, or at once for a child the parent added.',
      "The marks of a class test reach a parent only after the teacher shares them. A learner's own practice outside school is never sent to their school.",
      'People who build Jemma look at information only to fix a problem or answer you.',
    ],
  },
  {
    id: 'children',
    title: 'Children',
    body: [
      'POPIA treats everyone under 18 as a child, and most Jemma learners are children. Jemma uses a child\'s information with the consent of a parent or guardian.',
      'When a teacher adds a learner, the parent gives consent when they link to the child. When a parent adds their own child, adding the child is the consent. A learner who starts alone and is under 18 should ask a parent to link to them, with the code in Me.',
      'A parent can see, download and delete their child\'s information at any time.',
    ],
  },
  {
    id: 'ai',
    title: 'AI services',
    body: [
      'Jemma uses AI models to write lessons and practice and to read photos of written work. The main models run on Cloudflare Workers AI. Cloudflare says it does not train models on this content and does not keep it after it answers.',
      'When those models fail, a backup service, OpenRouter, sends the same request to other AI models. What we send is the work and the question, not a name.',
    ],
  },
  {
    id: 'where',
    title: 'Where it is kept',
    body: [
      'The database and the photos are kept with Supabase, and the app runs on Cloudflare. Their computers may be outside South Africa. They keep information for us under their own data protection terms.',
      'Photos are kept in private storage. Every request is checked against the rules of who may see what, inside the database itself.',
    ],
  },
  {
    id: 'long',
    title: 'How long',
    body: [
      'Jemma keeps information while the account is open.',
      'When a parent deletes a child\'s data, or someone deletes their account, it is deleted from Jemma at once. Copies in our providers\' backups go when those backups run out.',
    ],
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: [
      <>
        You may see what Jemma keeps, ask for a copy, have something fixed or deleted, and object to how it is used. Parents can do most of this themselves in{' '}
        <Link href="/p/data" style={link}>Privacy and your data</Link>: get a copy, delete a child&apos;s data or delete the account.
      </>,
      'Teachers and learners can ask us through the help form, and we answer.',
      'You may also complain to the Information Regulator of South Africa: inforegulator.org.za, or email POPIAComplaints@inforegulator.org.za.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes',
    body: ['When this policy changes, the new one is on this page with its date, and we say so in the app.'],
  },
]

export default function PrivacyPolicyPage() {
  return <LegalPage title="Privacy policy" updated="23 November 2026" intro="What Jemma keeps, why, who sees it and what you can do about it." sections={SECTIONS} />
}
