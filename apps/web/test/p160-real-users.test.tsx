import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JemmaDb } from '@jemma/profiling/db'
import { demoOn } from '../lib/demo-switch'
import { checkMessage, feedbackPath, MESSAGE_MAX } from '../lib/feedback'
import { deleteChildData, deleteParentAccount } from '../lib/family-data'

// P160: the app is for real people now. The demo copy is off on the live app, no button opens "Coming after the challenge", the help form keeps a
// message, and a parent can delete a child's data or their own account. The database is a small double: no network.

const help = vi.hoisted(() => ({ sendHelpMessage: vi.fn() }))
vi.mock('../app/(auth)/help/actions', () => help)
const data = vi.hoisted(() => ({ deleteChild: vi.fn(), deleteMyAccount: vi.fn(), setImproveConsent: vi.fn() }))
vi.mock('../app/p/data/actions', () => data)

import { MessageButton } from '../app/(auth)/help/MessageForm'
import SignInPage from '../app/(auth)/sign-in/page'
import { DeleteAccountButton, DeleteChildButton } from '../app/p/data/DeleteButtons'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  help.sendHelpMessage.mockReset()
  data.deleteChild.mockReset()
  data.deleteMyAccount.mockReset()
})

describe('the demo switch', () => {
  it('is off on the live app (production, JEMMA_DEMO not set), and on for local runs and the tests', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('JEMMA_DEMO', '')
    expect(demoOn()).toBe(false)
    vi.stubEnv('JEMMA_DEMO', '1')
    expect(demoOn()).toBe(true)
    vi.stubEnv('JEMMA_DEMO', '')
    vi.stubEnv('NODE_ENV', 'test')
    expect(demoOn()).toBe(true)
  })

  it('takes the "Try the demo" link off the sign-in page of the live app', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('JEMMA_DEMO', '')
    const off = renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({}) }))
    expect(off).not.toMatch(/demo/i)
    expect(off).not.toMatch(/judg/i)
    expect(off).toContain('Learn maths until you understand it.')
    vi.stubEnv('JEMMA_DEMO', '1')
    expect(renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve({}) }))).toContain('href="/demo"')
  })
})

/** Every source file of the app's screens, but the design kit (a page for building Jemma, off on the live app). */
function screensSource(dir = join(__dirname, '..', 'app')): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'kit' ? [] : screensSource(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('no dead ends', () => {
  it('no screen opens "Coming after the challenge" any more', () => {
    const left = screensSource().filter((f) => /Coming after the challenge|ComingButton|ComingSheet|ComingLink|ComingRow/.test(readFileSync(f, 'utf8')))
    expect(left).toEqual([])
  })

  it('learners never read the word gap on their own screens', () => {
    // The words between tags of the learner's screens, with the comments taken out first (the code may say gap: the learner may not read it).
    const words = (f: string) =>
      [...readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').matchAll(/>([^<>{}=;()]*\bgaps?\b[^<>{}=;()]*)</g)].map((m) => m[1]!.trim())
    const learner = screensSource().filter((f) => /[/\\]app[/\\](k|tour)[/\\]/.test(f) && f.endsWith('.tsx'))
    expect(learner.flatMap(words)).toEqual([])
  })
})

describe('the help form', () => {
  it('checks the kind, the length and the email, and drops what a program filled in', () => {
    expect(checkMessage({ kind: 'other', text: 'Hello there' })).toEqual({ ok: false, message: 'Pick what the message is about.' })
    expect(checkMessage({ kind: 'problem', text: ' hi ' })).toEqual({ ok: false, message: 'Write a few words first.' })
    expect(checkMessage({ kind: 'problem', text: 'x'.repeat(MESSAGE_MAX + 1) })).toMatchObject({ ok: false })
    expect(checkMessage({ kind: 'message', text: 'Hello there', email: 'not an email' })).toEqual({ ok: false, message: 'That email address does not look right.' })
    expect(checkMessage({ kind: 'message', text: ' Hello there ', email: ' a@b.co ' })).toEqual({ ok: true, bot: false, kind: 'message', text: 'Hello there', email: 'a@b.co' })
    expect(checkMessage({ kind: 'problem', text: 'Hello there', website: 'spam.example' })).toMatchObject({ ok: true, bot: true })
  })

  it('keeps one file a message, a folder a day', () => {
    expect(feedbackPath(new Date('2026-11-23T10:00:00Z'), 'abc')).toBe('2026-11-23/abc.json')
  })

  it('opens from the help page, sends the words, and says thank you', async () => {
    help.sendHelpMessage.mockResolvedValue({ ok: true })
    render(<MessageButton kind="problem" style={{}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }))
    fireEvent.change(screen.getByLabelText('What went wrong?'), { target: { value: 'The photo did not upload.' } })
    fireEvent.change(screen.getByLabelText('Your email, if you want an answer'), { target: { value: 'me@example.com' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })))
    expect(help.sendHelpMessage).toHaveBeenCalledWith({ kind: 'problem', text: 'The photo did not upload.', email: 'me@example.com', website: '' })
    expect(await screen.findByText('Your message is with the Jemma team.')).toBeTruthy()
  })
})

describe('deleting, from the parent side', () => {
  it('asks first, says what goes, and deletes only on the second tap', async () => {
    data.deleteChild.mockResolvedValue(undefined)
    render(<DeleteChildButton childId="child-1" name="Amina" />)
    fireEvent.click(screen.getByRole('button', { name: "Delete Amina's data" }))
    expect(data.deleteChild).not.toHaveBeenCalled()
    expect(screen.getByText(/marks, practice, lessons, photos and sign-in are deleted from Jemma now/)).toBeTruthy()
    expect(screen.getByText('This cannot be undone.')).toBeTruthy()
    const buttons = screen.getAllByRole('button', { name: "Delete Amina's data" })
    await act(async () => fireEvent.click(buttons[buttons.length - 1]!))
    expect(data.deleteChild).toHaveBeenCalledWith('child-1')
  })

  it('"Keep it" closes the question and deletes nothing', () => {
    render(<DeleteAccountButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(data.deleteMyAccount).not.toHaveBeenCalled()
    expect(screen.queryByText('This cannot be undone.')).toBeNull()
  })
})

/** A tiny in-memory database: the few calls `deleteChildData` and `deleteParentAccount` make, with every write recorded. */
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const log: string[] = []
  const removed: Record<string, string[]> = {}
  const usersDeleted: string[] = []
  function query(table: string) {
    const filters: ((r: Record<string, unknown>) => boolean)[] = []
    let op: 'select' | 'delete' = 'select'
    let cols = '*'
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
    const shape = (r: Record<string, unknown>) =>
      cols.includes('schools(kind)') ? { ...r, schools: (tables.schools ?? []).find((s) => s.id === r.school_id) ?? null } : r
    const run = () => {
      if (op === 'delete') {
        const gone = rows()
        tables[table] = (tables[table] ?? []).filter((r) => !gone.includes(r))
        log.push(`delete ${table} ${gone.map((r) => r.id).join(',')}`)
        return { data: null, error: null }
      }
      return { data: rows().map(shape), error: null }
    }
    const q = {
      select(c = '*') {
        cols = c
        return q
      },
      delete() {
        op = 'delete'
        return q
      },
      eq(c: string, v: unknown) {
        filters.push((r) => r[c] === v)
        return q
      },
      neq(c: string, v: unknown) {
        filters.push((r) => r[c] !== v)
        return q
      },
      in(c: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[c]))
        return q
      },
      maybeSingle: async () => ({ data: rows().map(shape)[0] ?? null, error: null }),
      insert: async (list: Record<string, unknown>[]) => {
        tables[table] = [...(tables[table] ?? []), ...list]
        log.push(`insert ${table} ${list.length}`)
        return { data: null, error: null }
      },
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
    }
    return q
  }
  const db = {
    from: query,
    storage: { from: (bucket: string) => ({ remove: async (paths: string[]) => ((removed[bucket] = [...(removed[bucket] ?? []), ...paths]), { data: [], error: null }) }) },
    auth: { admin: { deleteUser: async (id: string) => (usersDeleted.push(id), { data: {}, error: null }) } },
  }
  return { db: db as unknown as JemmaDb, tables, log, removed, usersDeleted }
}

describe('what goes when a child is deleted', () => {
  const base = () => ({
    schools: [
      { id: 'school-real', kind: 'school' },
      { id: 'school-own', kind: 'private' },
      { id: 'school-twin', kind: 'private' },
    ],
    children: [
      { id: 'amina', first_name: 'Amina', school_id: 'school-real', user_id: 'user-amina', private_of: null },
      { id: 'amina-twin', first_name: 'Amina', school_id: 'school-twin', user_id: 'user-amina', private_of: 'amina' },
      { id: 'neo', first_name: 'Neo', school_id: 'school-own', user_id: null, private_of: null },
    ],
    enrolments: [{ child_id: 'amina', class_id: 'class-6b' }],
    classes: [{ id: 'class-6b', name: '6B Mathematics', teacher_id: 'teacher-banda' }],
    papers: [{ id: 'paper-1', child_id: 'amina' }],
    paper_pages: [{ paper_id: 'paper-1', storage_path: 'school-real/class-6b/paper-1/1.jpg' }],
    lessons: [
      { child_id: 'amina-twin', audio_path: 'amina-twin/lesson.mp3' },
      { child_id: 'amina', audio_path: null },
    ],
    notifications: [] as Record<string, unknown>[],
    parent_links: [
      { parent_id: 'parent-thandi', child_id: 'amina', status: 'approved' },
      { parent_id: 'parent-thandi', child_id: 'neo', status: 'approved' },
    ],
  })

  it('a learner in a real school: the learner, the own side, the photos, the recordings and the login go, and the teacher is told why', async () => {
    const f = fakeDb(base())
    const done = await deleteChildData(f.db, 'amina')
    expect(done).toEqual({ firstName: 'Amina', told: 1 })
    expect(f.usersDeleted).toEqual(['user-amina'])
    expect(f.log).toContain('delete schools school-twin')
    expect(f.log).toContain('delete children amina')
    expect(f.log.some((l) => l.startsWith('delete schools school-real'))).toBe(false)
    expect(f.removed.papers).toEqual(['school-real/class-6b/paper-1/1.jpg'])
    expect(f.removed['lesson-audio']).toEqual(['amina-twin/lesson.mp3'])
    expect(f.tables.notifications).toEqual([
      { user_id: 'teacher-banda', title: 'Amina was taken out of 6B Mathematics', body: "Amina's parent deleted Amina's data in Jemma, so Amina is no longer in 6B Mathematics.", href: '/t/class-6b/learners' },
    ])
  })

  it('a learner a parent added alone: the whole school of their own goes, and no teacher is told', async () => {
    const f = fakeDb(base())
    expect(await deleteChildData(f.db, 'neo')).toEqual({ firstName: 'Neo', told: 0 })
    expect(f.log).toContain('delete schools school-own')
    expect(f.usersDeleted).toEqual([])
    expect(f.tables.notifications).toEqual([])
  })

  it('a parent account: a child added alone goes with it, a child in a class stays, then the login goes', async () => {
    const f = fakeDb(base())
    expect(await deleteParentAccount(f.db, 'parent-thandi')).toEqual({ childrenDeleted: 1 })
    expect(f.log).toContain('delete schools school-own')
    expect(f.log).not.toContain('delete children amina')
    expect(f.usersDeleted).toEqual(['parent-thandi'])
  })

  it('a child added alone that another parent also looks after stays, with that parent', async () => {
    const tables = base()
    tables.parent_links.push({ parent_id: 'parent-sipho', child_id: 'neo', status: 'approved' })
    const f = fakeDb(tables)
    expect(await deleteParentAccount(f.db, 'parent-thandi')).toEqual({ childrenDeleted: 0 })
    expect(f.log.some((l) => l.startsWith('delete schools'))).toBe(false)
  })
})
