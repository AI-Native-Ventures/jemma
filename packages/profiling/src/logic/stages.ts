import type { Stage } from './types'

const DAY_MS = 86_400_000

export function nextStage(input: {
  stage: Stage
  right: number
  firstPractisedAt: Date | null
  now: Date
  fixAfterDays: number
}): Stage {
  if (input.stage === 'new') return 'practising'
  if (input.stage === 'fixed') return 'fixed'
  const days = input.firstPractisedAt ? (input.now.getTime() - input.firstPractisedAt.getTime()) / DAY_MS : -1
  return input.right >= 4 && days >= input.fixAfterDays ? 'fixed' : 'practising'
}
