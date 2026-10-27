import { describe, expect, test } from 'vitest'
import { topicLabel } from '@/lib/topics'

describe('topicLabel', () => {
  const t = { name: 'Adding fractions with different denominators', short_name: 'Adding fractions' }
  test('short uses short_name', () => expect(topicLabel(t, 'short')).toBe('Adding fractions'))
  test('long uses the name', () => expect(topicLabel(t, 'long')).toBe(t.name))
  test('short falls back to the name when none is stored', () => expect(topicLabel({ name: 'Length', short_name: null }, 'short')).toBe('Length'))
})
