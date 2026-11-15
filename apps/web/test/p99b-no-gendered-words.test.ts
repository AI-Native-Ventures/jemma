import { globSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// P99b guard: no screen of the app assumes a person is female or male. Jemma speaks to and about parents, teachers and learners it knows nothing
// about but a name, so a word that says "she" or "he" is wrong for some of them. In the words a person can read in apps/web/app, apps/web/components
// and apps/web/lib (string literals, template literals and the text of JSX, never a comment, a regular expression or a name in the code), a learner or a
// parent is called by their name, or by "they", "their" and "them", or by "the" (the teacher's memo, the paper). The test reads the source files,
// not a browser. It scans for she, her, hers, herself, he, him, his and himself, in any case.
//
// Not covered, on purpose: made-up people in the seed and in the tests, words a teacher or a parent typed
// themselves (observations, a relation such as "mum", a name), and the log lines the agent's tools write (packages/profiling), which are not in these folders.

const webRoot = resolve(import.meta.dirname, '..')
const files = ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'].flatMap((p) => globSync(p, { cwd: webRoot })).sort()

const GENDERED = /\b(she|her|hers|herself|he|him|his|himself)\b/i

/**
 * Files left as they are on purpose. Each says why. A file is let through only for the exact line named, so a new fault in it is still found.
 */
const ALLOWED: { file: string; text: string; why: string }[] = [
  {
    file: 'app/t/[classId]/learners/records/samples.ts',
    text: 'Explained his findings clearly',
    why: 'a row of the sample file "messy-old-marks.csv" a teacher can import; the text is that file byte for byte (fixtures/records/messy-old-marks.csv, test p66-samples) and is a comment a made-up teacher typed about a made-up learner, not a word of the app',
  },
]
const allowed = (file: string, text: string) => ALLOWED.some((a) => a.file === file && text.includes(a.text))

/** Text a person can read that the source holds, with the line it is on. Comments, regular expressions and import paths are not text. */
function readableText(file: string, src: string): { line: number; text: string }[] {
  const source = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: { line: number; text: string }[] = []
  const add = (node: ts.Node, text: string) => {
    if (GENDERED.test(text)) found.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, text: text.trim().replace(/\s+/g, ' ') })
  }
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
    // A type such as `'her' | 'his'` names a value, it does not speak to anyone.
    if (ts.isLiteralTypeNode(node)) return
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
      add(node, node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('no screen assumes a person is female or male', () => {
  it('reads the folders it says it reads', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files).toContain('app/p/add/consent/page.tsx')
    expect(files).toContain('app/t/[classId]/link-requests/[linkId]/page.tsx')
    expect(files).toContain('lib/data/p23.ts')
  })

  it('finds a gendered word in a string, a template and JSX text, and not in a comment, a regular expression or a type', () => {
    const sample = [
      "// she said it",
      "const re = /^(.+?) finished (her|his|their) lesson/",
      "type Who = 'her' | 'his'",
      "const a = 'Is she here?'",
      'const b = `${name} sees her score`',
      'const c = <p>He is here</p>',
      "const d = 'the teacher, then them and theirs'",
    ].join('\n')
    expect(readableText('sample.tsx', sample).map((f) => f.text)).toEqual(['Is she here?', 'sees her score', 'He is here'])
  })

  it('has no she, her, hers, he, him or his in the words of apps/web/app, apps/web/components and apps/web/lib', () => {
    const faults = files.flatMap((file) =>
      readableText(file, readFileSync(resolve(webRoot, file), 'utf8'))
        .filter((f) => !allowed(file, f.text))
        .map((f) => `${relative(webRoot, resolve(webRoot, file))}:${f.line}: ${f.text}`),
    )
    expect(faults).toEqual([])
  })
})
