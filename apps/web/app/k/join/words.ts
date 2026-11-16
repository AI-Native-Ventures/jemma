/** Where the card is drawn: the learner's home, or Me. */
export type JoinPlace = 'home' | 'me'

/**
 * The words of the card in each place. The learner's home keeps to "class": a learner who signed up alone has a home that never speaks of a school or a
 * teacher, and the card must not be the first thing that does. Me says it in full: "Join your school class" and "Your teacher's class code".
 */
export const JOIN_WORDS: Record<JoinPlace, { heading: string; intro: string; label: string; declined: string }> = {
  home: {
    heading: 'Join your class',
    intro: 'Got a class code? Type it here to join your class.',
    label: 'Class code',
    declined: 'The answer was no. Check the code and try again.',
  },
  me: {
    heading: 'Join your school class',
    intro: "Type your teacher's class code. When your teacher says yes, you get My school beside My own.",
    label: "Your teacher's class code",
    declined: 'Your teacher said no. Check the code and try again.',
  },
}
