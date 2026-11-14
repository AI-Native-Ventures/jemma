// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// P100: the documents say what the sign-up page does now. They read the files only: no database, no network, no model.

const root = resolve(import.meta.dirname, '../../..')
const read = (file: string) => readFileSync(resolve(root, file), 'utf8')

/** The text under one `##` heading of a Markdown file, up to the next `##` heading. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}\n`)
  expect(start, `a section "${heading}"`).toBeGreaterThanOrEqual(0)
  const rest = text.slice(start + 1)
  const next = rest.indexOf('\n## ', 4)
  return next < 0 ? rest : rest.slice(0, next)
}

describe('the README', () => {
  const readme = read('README.md')

  it('says in "Run it" how to sign up with an email and a password, and that the code by email needs an email sender the preview lacks', () => {
    const run = section(readme, 'Run it')
    expect(run).toContain('/sign-up')
    expect(run).toMatch(/email and a password/)
    expect(run).toMatch(/No email is sent/)
    expect(run).toMatch(/Email me a code instead/)
    expect(run).toMatch(/needs an email sender/)
    expect(run).toMatch(/none is set up on the live preview/)
  })

  it('says in "What is not finished" that a forgotten password cannot be reset', () => {
    const notFinished = section(readme, 'What is not finished')
    expect(notFinished).toMatch(/No way to reset a forgotten password/)
    expect(notFinished).toContain("Forgot your password? Ask the person who set up your school's Jemma.")
  })
})

describe('docs/judges.md', () => {
  const judges = read('docs/judges.md')

  it('says a judge can make a real teacher or parent account with an email and a password', () => {
    const accounts = section(judges, 'Demo accounts')
    expect(accounts).toContain('/sign-up')
    expect(accounts).toMatch(/real teacher or parent account/)
    expect(accounts).toMatch(/email and password|an email and a password/)
  })

  it('no longer says email sign-in is the sign-in screen, or that it was never part of the path', () => {
    expect(judges).not.toMatch(/The sign-in screen asks for a 6-digit code/)
    expect(judges).not.toContain('Email sign-in is not part of the path')
    expect(section(judges, 'Known limits')).toMatch(/A forgotten password cannot be reset/)
  })
})

describe('no document says there is no password to remember', () => {
  it.each(['README.md', 'docs/judges.md', 'docs/compliance.md', 'docs/architecture.md', 'ARCHITECTURE.md'])('%s', (file) => {
    expect(read(file)).not.toMatch(/No password to remember/i)
  })
})
