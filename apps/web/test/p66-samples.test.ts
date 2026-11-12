// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SAMPLE_RECORDS } from '../app/t/[classId]/learners/records/samples'

// "Use a sample file" offers the two files of fixtures/records. The web app has no files on disk when it runs as a Worker,
// so their text is written out in samples.ts. This test keeps the two in step.

const FIXTURES = join(import.meta.dirname, '../../../fixtures/records')

describe('the sample files of the demo school', () => {
  for (const [name, sample] of Object.entries(SAMPLE_RECORDS)) {
    it(`${name}: the text is the file ${sample.fileName} byte for byte`, () => {
      expect(sample.text).toBe(readFileSync(join(FIXTURES, sample.fileName), 'utf8'))
    })
  }

  it('has no em dash in either file or in the words next to them', () => {
    const dash = String.fromCharCode(0x2014)
    for (const sample of Object.values(SAMPLE_RECORDS)) expect(sample.text + sample.about + sample.button).not.toContain(dash)
  })
})
