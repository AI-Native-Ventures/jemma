import { redirect } from 'next/navigation'

/** The tab "My gaps" is now "My maths" (/k/maths): the learner's gaps are listed there, next to their count in each part of Mathematics. */
export default function ChildGapsPage(): never {
  redirect('/k/maths')
}
