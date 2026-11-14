import { globSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

// Files must reach the server through the upload routes (apps/web/lib/upload-client.ts, postFiles), never as the argument of a form
// action. Cloudflare's edge refuses a form action whose body holds the bytes '$F, and a PDF or a photo holds them by chance (about
// 1 file in 2 at 5 MB). The refusal comes from the edge, so no local run shows it: this test is what keeps the fault from coming back.
// It reads source only: no database, no network, no browser.

const root = resolve(import.meta.dirname, '../../..')

/** The eight functions that take file bytes. They stay `'use server'` functions, and only the three upload routes call them. */
const UPLOAD_FUNCTIONS = ['uploadCurriculum', 'uploadMemo', 'addPaper', 'uploadScans', 'addPage', 'retakePaper', 'snapHomework', 'snapPractice'] as const

const WHY = "file bytes must go through postFiles (lib/upload-client.ts): Cloudflare's edge refuses a form action whose body holds the bytes '$F"

/** True when the file's first statement is the `'use client'` directive (comments may come before it). */
function isClientFile(source: string): boolean {
  return /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*(['"])use client\1/.test(source)
}

/** The names of the eight functions that a client file takes from an actions file (a named import, a namespace import or a dynamic import). */
function uploadFunctionsImported(source: string): string[] {
  const found = new Set<string>()
  const fromActions = (specifier: string) => /(?:^|\/)actions(?:\.[cm]?[jt]sx?)?$/.test(specifier)
  for (const m of source.matchAll(/import\s+(?:type\s+)?([^'";]*?)\s*from\s*(['"])([^'"]+)\2/g)) {
    if (!fromActions(m[3]!)) continue
    const clause = m[1]!
    const named = /\{([^}]*)\}/.exec(clause)?.[1] ?? ''
    for (const part of named.split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim()
      if ((UPLOAD_FUNCTIONS as readonly string[]).includes(name)) found.add(name)
    }
    const namespace = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause)?.[1]
    if (namespace) for (const fn of UPLOAD_FUNCTIONS) if (new RegExp(`\\b${namespace}\\.${fn}\\b`).test(source)) found.add(fn)
  }
  for (const m of source.matchAll(/import\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) {
    if (!fromActions(m[2]!)) continue
    for (const fn of UPLOAD_FUNCTIONS) if (new RegExp(`\\b${fn}\\b`).test(source)) found.add(fn)
  }
  return [...found]
}

describe('the guard itself', () => {
  test('it sees a named import, an aliased one, a type-prefixed one, a namespace import and a dynamic import', () => {
    expect(uploadFunctionsImported(`import { retryDraft, uploadCurriculum, useSampleCurriculum } from './actions'`)).toEqual(['uploadCurriculum'])
    expect(uploadFunctionsImported(`import { addPage, addPaper, retakePaper } from '../../actions'`).sort()).toEqual(['addPage', 'addPaper', 'retakePaper'])
    expect(uploadFunctionsImported(`import { uploadMemo as send } from "../actions.ts"`)).toEqual(['uploadMemo'])
    expect(uploadFunctionsImported(`import { answer, snapPractice } from './actions'`)).toEqual(['snapPractice'])
    expect(uploadFunctionsImported(`import {\n  approveKey,\n  uploadScans,\n} from '@/app/t/[classId]/snap/actions'`)).toEqual(['uploadScans'])
    expect(uploadFunctionsImported(`import * as actions from './actions'\nawait actions.snapHomework(a, b, c, d)`)).toEqual(['snapHomework'])
    expect(uploadFunctionsImported(`const { uploadMemo } = await import('./actions')`)).toEqual(['uploadMemo'])
  })

  test('it lets the other actions, and the same names from somewhere else, through', () => {
    expect(uploadFunctionsImported(`import { approveKey, confirmKeyItem, createTest } from '../../actions'`)).toEqual([])
    expect(uploadFunctionsImported(`import { uploadMemo } from '@/lib/upload-client'`)).toEqual([])
    expect(uploadFunctionsImported(`import * as actions from './actions'\nawait actions.approveKey(a)`)).toEqual([])
    expect(uploadFunctionsImported(`import { postFiles } from '@/lib/upload-client'\nconst x = 'uploadMemo'`)).toEqual([])
  })

  test('it knows a client file from a server file', () => {
    expect(isClientFile(`'use client'\n\nimport x from 'y'`)).toBe(true)
    expect(isClientFile(`"use client"\nimport x from 'y'`)).toBe(true)
    expect(isClientFile(`// the screen\n/* more */\n'use client'\n`)).toBe(true)
    expect(isClientFile(`'use server'\nimport x from 'y'`)).toBe(false)
    expect(isClientFile(`import x from 'y'\n// 'use client'`)).toBe(false)
  })
})

describe('no screen sends file bytes through a form action', () => {
  const files = ['apps/web/app/**/*.{ts,tsx}', 'apps/web/components/**/*.{ts,tsx}'].flatMap((p) => globSync(p, { cwd: root }))
  const clients = files.filter((f) => isClientFile(readFileSync(join(root, f), 'utf8')))

  test('the scan reads the client files (it is not passing on an empty list)', () => {
    expect(clients.length).toBeGreaterThan(30)
    // the screens that send files
    for (const file of ['curriculum/parts.tsx', 'papers/UploadZone.tsx', 'snap/SnapTestForm.tsx', 'key/KeyList.tsx', 'key/draft/DraftKey.tsx', 'papers/Queue.tsx', 'photo/PhotoScreen.tsx', 'session/[sessionId]/SessionFlow.tsx']) {
      expect(clients.some((f) => f.endsWith(file)), file).toBe(true)
    }
  })

  test(`no 'use client' file imports ${UPLOAD_FUNCTIONS.join(', ')} from an actions file`, () => {
    const offenders = clients.flatMap((f) => uploadFunctionsImported(readFileSync(join(root, f), 'utf8')).map((fn) => `${f} imports ${fn}`))
    expect(offenders, WHY).toEqual([])
  })

  test('the client helper can name all eight functions', () => {
    const client = readFileSync(join(root, 'apps/web/lib/upload-client.ts'), 'utf8')
    for (const fn of UPLOAD_FUNCTIONS) expect(client, `${fn} is an UploadAction`).toContain(`'${fn}'`)
  })

  test('the three upload routes name all eight functions, and the actions files still export them', () => {
    const routes = ['apps/web/app/t/upload/route.ts', 'apps/web/app/p/upload/route.ts', 'apps/web/app/k/upload/route.ts'].map((f) => readFileSync(join(root, f), 'utf8')).join('\n')
    const actions = [
      'apps/web/app/t/[classId]/curriculum/actions.ts',
      'apps/web/app/t/[classId]/snap/actions.ts',
      'apps/web/app/p/[childId]/snap/actions.ts',
      'apps/web/app/k/session/[sessionId]/actions.ts',
    ]
      .map((f) => readFileSync(join(root, f), 'utf8'))
      .join('\n')
    for (const fn of UPLOAD_FUNCTIONS) {
      expect(routes, `${fn} is named in an upload route`).toMatch(new RegExp(`\\b${fn}\\b`))
      expect(actions, `${fn} is still exported from its 'use server' file`).toMatch(new RegExp(`export async function ${fn}\\b`))
    }
  })
})
