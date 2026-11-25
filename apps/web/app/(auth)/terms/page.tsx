import Link from 'next/link'
import { LegalPage, type LegalSection } from '../_legal'

export const metadata = { title: 'Terms of use · Jemma' }

const link = { color: '#161616', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 } as const

const SECTIONS: LegalSection[] = [
  {
    id: 'about',
    title: 'About these terms',
    body: [
      'These terms are between you and AI Native Ventures, the makers of Jemma. By making an account or using Jemma you agree to them.',
      <>
        How Jemma uses information is in the <Link href="/privacy/policy" style={link}>privacy policy</Link>.
      </>,
    ],
  },
  {
    id: 'accounts',
    title: 'Your account',
    body: [
      'Give your real name and an email address that is yours. Keep your password to yourself. One account is for one person.',
      'Teachers add only learners they teach. Parents add only their own children, or children they care for.',
      'Learners under 18 use Jemma with the permission of a parent or guardian.',
    ],
  },
  {
    id: 'price',
    title: 'What it costs',
    body: [
      'Every lesson is free. Without a plan, each child has 2 practices a day.',
      "A plan gives more practice. It is on a parent's account, and the parent's children share its practices of a month: Light 150, Regular 300, Heavy 600. Prices are shown in US dollars, by the year, and follow your country: a family in the US pays twice the price in South Africa.",
      'You pay on PayFast, a payment service. Jemma never sees your card. PayFast charges in South African rand, so your bank may change the amount to your money and may add a fee.',
      'A plan renews each year until you cancel. You can cancel any time in Your account, Plans and payments: nothing more is charged, and the plan works to the end of the year you paid for.',
      'A bigger plan starts at once: you pay the difference for the rest of the year. A smaller plan starts at your next payment. If a payment fails, the plan works for 7 more days so you can change the card.',
      'You can ask for your money back within 7 days of a payment, with the help form.',
    ],
  },
  {
    id: 'ai',
    title: 'Jemma can make mistakes',
    body: [
      'Lessons, practice and marks are made with AI, and AI can be wrong. A teacher approves the curriculum map and the answer key of a class test before marks reach anyone.',
      'If a mark looks wrong, tell the teacher, or tell us with the help form. Jemma helps learners and teachers. It does not replace a teacher.',
    ],
  },
  {
    id: 'use',
    title: 'Using Jemma well',
    body: [
      'Upload only work and information you have the right to share. Do not upload anything harmful, and do not try to see what is not yours.',
      'Do not try to break Jemma, overload it or get around its rules.',
    ],
  },
  {
    id: 'yours',
    title: 'Your work',
    body: [
      'What you upload stays yours. You let us keep and use it to run Jemma for you, as the privacy policy says.',
      'The code of Jemma is open source under the MIT licence. Some lessons are based on other people\'s work, and each one says where it came from.',
    ],
  },
  {
    id: 'end',
    title: 'Ending',
    body: [
      'You can stop using Jemma at any time, and parents can delete their account in the app. Teachers can ask us to delete theirs.',
      'We may close an account that breaks these terms, and we tell the account holder why.',
    ],
  },
  {
    id: 'law',
    title: 'The law',
    body: [
      'Jemma is offered as it is. As far as the law allows, we are not responsible for losses that come from using it.',
      'Nothing in these terms takes away a right you have under South African law, such as under the Consumer Protection Act. These terms follow the law of South Africa.',
    ],
  },
  {
    id: 'contact',
    title: 'Changes and questions',
    body: [
      'When these terms change, the new ones are on this page with their date, and we say so in the app.',
      <>
        Questions? Open <Link href="/help" style={link}>Help</Link> and tap Message the Jemma team.
      </>,
    ],
  },
]

export default function TermsPage() {
  return <LegalPage title="Terms of use" updated="23 November 2026" intro="The rules for using Jemma, in plain words." sections={SECTIONS} />
}
