// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { displayNameFor } from '../lib/display-name'

// The name typed at sign-up (kept by the sign-in service as `full_name`) becomes the profile's display name.
// Without one, the part of the email before the @ is used, as it always was.

describe('displayNameFor', () => {
  test('uses the name typed at sign-up', () => {
    expect(displayNameFor({ email: 'a.nkosi@school.example', user_metadata: { full_name: 'Ms Nkosi' } })).toBe('Ms Nkosi')
  })

  test('trims it and joins runs of spaces', () => {
    expect(displayNameFor({ email: 'x@y.example', user_metadata: { full_name: '  Mrs   Otieno ' } })).toBe('Mrs Otieno')
  })

  test('falls back to the email name when no name was typed, or it is empty or not text', () => {
    expect(displayNameFor({ email: 'ms.banda@hillview.example', user_metadata: {} })).toBe('ms.banda')
    expect(displayNameFor({ email: 'ms.banda@hillview.example' })).toBe('ms.banda')
    expect(displayNameFor({ email: 'ms.banda@hillview.example', user_metadata: { full_name: '   ' } })).toBe('ms.banda')
    expect(displayNameFor({ email: 'ms.banda@hillview.example', user_metadata: { full_name: 42 } })).toBe('ms.banda')
    expect(displayNameFor({ email: 'ms.banda@hillview.example', user_metadata: null })).toBe('ms.banda')
  })

  test('with neither a name nor an email it is "New user"', () => {
    expect(displayNameFor({})).toBe('New user')
    expect(displayNameFor({ email: null })).toBe('New user')
  })

  test('keeps a very long name to 80 characters', () => {
    expect(displayNameFor({ user_metadata: { full_name: 'x'.repeat(200) } })).toHaveLength(80)
  })
})
