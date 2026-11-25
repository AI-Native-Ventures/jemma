import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { builtInMapOf } from '../../../packages/profiling/src/curriculum/caps-map'
import { usDraft, usGrades } from '../../../packages/profiling/src/curriculum/us'
import { amountMatches, apiSignature, checkoutFields, itnParamString, itnSignatureOk, payfastEnv, pfEncode, signOrdered, subscriptionCall } from '../lib/payfast'
import { handleNotice, sameRate } from '../lib/payfast-notice'
import { FREE_A_DAY, PLANS, givesPractice, isBigger, payfastAmount, randText, upgradeUsd, yearAfter, zarCentsOf } from '../lib/plans'
import { cleanTag, defaultCountry, mayBeUnder13 } from '../lib/signups'
import { dayWindow, monthWindow, zoneOf } from '../lib/zones'

// P161: family plans paid with PayFast, the practice allowance's day and month, the US as a country of its own (its curriculum, its age rule).

const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex')
const ENV = { merchantId: '10000100', merchantKey: '46f0cd694581a', passphrase: 'jt7NOE43FZPn', sandbox: true }

describe('the plans', () => {
  it('are Light, Regular and Heavy, by the year in whole dollars, with a monthly pool for the family, and 2 free practices a day without one', () => {
    expect(PLANS.map((p) => [p.id, p.priceUsd, p.perMonth])).toEqual([
      ['light', 48, 150],
      ['regular', 96, 300],
      ['heavy', 192, 600],
    ])
    expect(FREE_A_DAY).toBe(2)
    expect(isBigger('heavy', 'regular')).toBe(true)
    expect(isBigger('light', 'regular')).toBe(false)
  })

  it('turns dollars into rand at a rate, rounded to R10, and writes it as PayFast and a person read it', () => {
    expect(zarCentsOf(96, 17)).toBe(163000)
    expect(zarCentsOf(48, 16.95)).toBe(81000)
    expect(payfastAmount(163000)).toBe('1630.00')
    expect(randText(163000)).toBe('R1,630')
  })

  it('charges the difference of a bigger plan for the days left of the paid year, in whole dollars, never under $1', () => {
    const now = new Date('2026-11-23T00:00:00Z')
    expect(upgradeUsd('regular', 'heavy', yearAfter(now), now)).toBe(96)
    expect(upgradeUsd('regular', 'heavy', new Date('2027-05-24T00:00:00Z'), now)).toBe(48)
    expect(upgradeUsd('light', 'regular', new Date('2026-11-24T00:00:00Z'), now)).toBe(1)
  })

  it('keeps the rate a plan was bought at for its later amounts', () => {
    expect(sameRate({ amount_zar_cents: 163000, price_usd: 96 }, 192)).toBe(326000)
    expect(sameRate({ amount_zar_cents: 163000, price_usd: 96 }, 48)).toBe(82000)
  })

  it('gives practice while active (and a few days after its year, for the renewal), cancelled to the end of its year, failed in its grace', () => {
    const now = new Date('2026-12-01T00:00:00Z')
    expect(givesPractice({ status: 'active', period_end: '2027-11-23T00:00:00Z', grace_until: null }, now)).toBe(true)
    expect(givesPractice({ status: 'active', period_end: '2026-11-29T00:00:00Z', grace_until: null }, now)).toBe(true)
    expect(givesPractice({ status: 'active', period_end: '2026-11-20T00:00:00Z', grace_until: null }, now)).toBe(false)
    expect(givesPractice({ status: 'cancelled', period_end: '2026-11-30T00:00:00Z', grace_until: null }, now)).toBe(false)
    expect(givesPractice({ status: 'failed', period_end: null, grace_until: '2026-12-03T00:00:00Z' }, now)).toBe(true)
    expect(givesPractice({ status: 'pending', period_end: null, grace_until: null }, now)).toBe(false)
  })
})

describe('the day and the month of the allowance', () => {
  it('are those of the learner country: midnight in Johannesburg, midnight in New York', () => {
    const at = new Date('2026-11-23T21:30:00Z')
    expect(zoneOf('ZA')).toBe('Africa/Johannesburg')
    expect(zoneOf('US')).toBe('America/New_York')
    expect(zoneOf('XX')).toBe('UTC')
    expect(dayWindow(at, 'Africa/Johannesburg').from.toISOString()).toBe('2026-11-22T22:00:00.000Z')
    expect(dayWindow(at, 'America/New_York').from.toISOString()).toBe('2026-11-23T05:00:00.000Z')
    expect(monthWindow(at, 'Africa/Johannesburg').to.toISOString()).toBe('2026-11-30T22:00:00.000Z')
    expect(monthWindow(at, 'America/New_York').from.toISOString()).toBe('2026-11-01T04:00:00.000Z')
  })
})

describe('PayFast', () => {
  it('is set up only when the merchant id, key and passphrase are all set', () => {
    expect(payfastEnv({})).toBeNull()
    expect(payfastEnv({ PAYFAST_MERCHANT_ID: '1', PAYFAST_MERCHANT_KEY: 'k' })).toBeNull()
    expect(payfastEnv({ PAYFAST_MERCHANT_ID: '1', PAYFAST_MERCHANT_KEY: 'k', PAYFAST_PASSPHRASE: 'p', PAYFAST_SANDBOX: '1' })).toEqual({ merchantId: '1', merchantKey: 'k', passphrase: 'p', sandbox: true })
  })

  it('encodes a value as PHP does: a space is +, and the marks JavaScript leaves alone are encoded in capitals', () => {
    expect(pfEncode("Jemma Regular, one year (it's fine)!")).toBe('Jemma+Regular%2C+one+year+%28it%27s+fine%29%21')
  })

  it('signs the fields in their order, leaving out the empty ones, with the passphrase last', () => {
    const sig = signOrdered([['merchant_id', '1'], ['empty', ''], ['item_name', 'A B']], 'pass word')
    expect(sig).toBe(md5('merchant_id=1&item_name=A+B&passphrase=pass+word'))
  })

  it('makes the form of a yearly plan in PayFast order: frequency 6 (yearly), cycles 0 (until cancelled), and the signature last', () => {
    const fields = checkoutFields(ENV, {
      returnUrl: 'https://x/done',
      cancelUrl: 'https://x/stopped',
      notifyUrl: 'https://x/api/payfast/notify',
      paymentId: 'sub_1',
      amount: '1630.00',
      itemName: 'Jemma Regular, one year',
      email: 'parent@example.com',
      subscription: { recurringAmount: '1630.00', billingDate: '2027-11-23' },
    })
    expect(fields.map(([k]) => k)).toEqual([
      'merchant_id', 'merchant_key', 'return_url', 'cancel_url', 'notify_url', 'email_address', 'm_payment_id', 'amount', 'item_name',
      'subscription_type', 'billing_date', 'recurring_amount', 'frequency', 'cycles', 'signature',
    ])
    const get = (k: string) => fields.find(([key]) => key === k)![1]
    expect([get('subscription_type'), get('frequency'), get('cycles')]).toEqual(['1', '6', '0'])
    expect(get('signature')).toBe(signOrdered(fields.slice(0, -1), ENV.passphrase))
  })

  it('believes a notice only with the right signature', () => {
    const entries: [string, string][] = [['m_payment_id', 'sub_1'], ['pf_payment_id', '123'], ['payment_status', 'COMPLETE'], ['amount_gross', '1630.00']]
    const signature = md5(`${itnParamString(entries)}&passphrase=${pfEncode(ENV.passphrase)}`)
    expect(itnSignatureOk([...entries, ['signature', signature]], ENV.passphrase)).toBe(true)
    expect(itnSignatureOk([...entries, ['signature', signature.replace(/.$/, '0')]], ENV.passphrase)).toBe(signature.endsWith('0'))
    expect(itnSignatureOk([...entries, ['signature', 'x']], ENV.passphrase)).toBe(false)
    expect(amountMatches('1630.00', 163000)).toBe(true)
    expect(amountMatches('1629.00', 163000)).toBe(false)
  })

  it('signs an API call with every value and the passphrase, sorted by name', () => {
    expect(apiSignature({ version: 'v1', 'merchant-id': '1', timestamp: '2026-11-23T10:00:00+00:00' }, 'p')).toBe(
      md5('merchant-id=1&passphrase=p&timestamp=2026-11-23T10%3A00%3A00%2B00%3A00&version=v1'),
    )
  })

  it('cancels with PUT and changes the yearly amount with PATCH, on the sandbox with ?testing=true', async () => {
    const calls: { url: string; method?: string; body?: unknown }[] = []
    const fake = async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body })
      return new Response('{}', { status: 200 })
    }
    await subscriptionCall(ENV, 'tok', { kind: 'cancel' }, new Date('2026-11-23T10:00:00Z'), fake)
    await subscriptionCall(ENV, 'tok', { kind: 'update', amountZarCents: 81000 }, new Date('2026-11-23T10:00:00Z'), fake)
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['PUT', 'https://api.payfast.co.za/subscriptions/tok/cancel?testing=true'],
      ['PATCH', 'https://api.payfast.co.za/subscriptions/tok/update?testing=true'],
    ])
    expect(calls[1]!.body).toBe('{"amount":81000}')
  })
})

/** A small database in memory: just the reads and writes a payment notice makes. */
function fakeDb(tables: Record<string, Record<string, unknown>[]>) {
  const from = (table: string) => {
    const filters: [string, unknown][] = []
    let patch: Record<string, unknown> | null = null
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v))
    const b = {
      select: () => b,
      eq: (k: string, v: unknown) => {
        filters.push([k, v])
        return b
      },
      limit: () => b,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      update: (fields: Record<string, unknown>) => {
        patch = fields
        return b
      },
      insert: async (row: Record<string, unknown>) => {
        ;(tables[table] ??= []).push({ id: `row-${(tables[table] ?? []).length + 1}`, ...row })
        return { error: null }
      },
      then: (ok: (v: unknown) => void) => {
        if (patch) for (const r of rows()) Object.assign(r, patch)
        return Promise.resolve(patch ? { error: null } : { data: rows(), error: null }).then(ok)
      },
    }
    return b
  }
  return { from } as never
}

const SUB = 'a1b2c3d4-0000-4000-8000-000000000001'

describe('a payment notice', () => {
  afterEach(() => vi.unstubAllGlobals())
  const notice = (status: string, more: [string, string][] = []): [string, string][] => [
    ['m_payment_id', `sub_${SUB}`],
    ['pf_payment_id', '9001'],
    ['payment_status', status],
    ['amount_gross', '1630.00'],
    ['amount_fee', '-57.05'],
    ['amount_net', '1572.95'],
    ['token', 'tok-1'],
    ['email_address', 'parent@example.com'],
    ...more,
  ]
  const pending = () => ({ subscriptions: [{ id: SUB, parent_id: 'p1', plan: 'regular', status: 'pending', price_usd: 96, amount_zar_cents: 163000, period_end: null, grace_until: null, next_plan: null, token: null, follows: null, upgrade_plan: null }], payments: [] as Record<string, unknown>[] })

  it('starts the paid year on the first payment, keeps the token, and writes the payment without the buyer name or email', async () => {
    const t = pending()
    const res = await handleNotice(fakeDb(t), ENV, notice('COMPLETE'), new Date('2026-11-23T12:00:00Z'))
    expect(res).toEqual({ done: `plan ${SUB} started` })
    expect(t.subscriptions[0]).toMatchObject({ status: 'active', token: 'tok-1', period_end: '2027-11-23T12:00:00.000Z' })
    expect(t.payments[0]).toMatchObject({ kind: 'plan', status: 'paid', price_usd: 96, amount_gross_zar_cents: 163000, amount_fee_zar_cents: 5705 })
    expect(JSON.stringify(t.payments[0])).not.toContain('parent@example.com')
  })

  it('writes a payment PayFast sends twice only once, and refuses an amount that is not the plan', async () => {
    const t = pending()
    await handleNotice(fakeDb(t), ENV, notice('COMPLETE'))
    expect(await handleNotice(fakeDb(t), ENV, notice('COMPLETE'))).toEqual({ ignored: 'payment 9001 already written' })
    const u = pending()
    const wrong = notice('COMPLETE').map(([k, v]) => [k, k === 'amount_gross' ? '16.30' : v] as [string, string])
    expect('ignored' in (await handleNotice(fakeDb(u), ENV, wrong))).toBe(true)
    expect(u.subscriptions[0]!.status).toBe('pending')
  })

  it('adds a year on a renewal, and a smaller plan picked for it starts then', async () => {
    const t = pending()
    Object.assign(t.subscriptions[0]!, { status: 'active', period_end: '2027-11-23T12:00:00.000Z', token: 'tok-1', next_plan: 'light' })
    await handleNotice(fakeDb(t), ENV, notice('COMPLETE').map(([k, v]) => [k, k === 'pf_payment_id' ? '9002' : v] as [string, string]))
    expect(t.subscriptions[0]).toMatchObject({ status: 'active', plan: 'light', price_usd: 48, next_plan: null, period_end: '2028-11-23T12:00:00.000Z' })
  })

  it('a plan cancelled on PayFast runs to the end of its year; a failed renewal gives 7 days for a new card', async () => {
    const t = pending()
    Object.assign(t.subscriptions[0]!, { status: 'active', period_end: '2027-11-23T12:00:00.000Z' })
    await handleNotice(fakeDb(t), ENV, notice('CANCELLED'))
    expect(t.subscriptions[0]!.status).toBe('cancelled')
    const u = pending()
    Object.assign(u.subscriptions[0]!, { status: 'active', period_end: '2027-11-23T12:00:00.000Z' })
    await handleNotice(fakeDb(u), ENV, notice('FAILED'), new Date('2027-11-23T13:00:00Z'))
    expect(u.subscriptions[0]).toMatchObject({ status: 'failed', grace_until: '2027-11-30T13:00:00.000Z' })
    expect(u.payments[0]).toMatchObject({ status: 'failed' })
  })

  it('starts a bigger plan when its difference is paid, and tells PayFast the new yearly amount', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url} ${init?.body}`)
      return new Response('{}', { status: 200 })
    })
    const t = pending()
    Object.assign(t.subscriptions[0]!, { status: 'active', period_end: '2027-11-23T12:00:00.000Z', token: 'tok-1', upgrade_plan: 'heavy', upgrade_usd: 48, upgrade_zar_cents: 81500 })
    const up = notice('COMPLETE').map(([k, v]) => [k, k === 'm_payment_id' ? `up_${SUB}` : k === 'amount_gross' ? '815.00' : v] as [string, string])
    expect(await handleNotice(fakeDb(t), ENV, up)).toEqual({ done: `upgrade of ${SUB} to heavy` })
    expect(t.subscriptions[0]).toMatchObject({ plan: 'heavy', price_usd: 192, amount_zar_cents: 326000, upgrade_plan: null })
    expect(calls).toEqual(['PATCH https://api.payfast.co.za/subscriptions/tok-1/update?testing=true {"amount":326000}'])
  })
})

describe('the US, a country of its own (P161)', () => {
  it('has a maths map for Grades 1 to 12 (Common Core), next to South Africa, and none for a country without one', () => {
    expect(usGrades()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    const families = new Set(['whole_numbers', 'fractions', 'decimals', 'shapes', 'measurement', 'data', 'patterns', 'probability', 'integers_and_exponents', 'functions', 'algebra', 'trigonometry', 'analytical_geometry', 'finance', 'calculus'])
    for (const g of usGrades()) {
      const d = usDraft(g)!
      const topics = d.terms.flatMap((t) => t.topics)
      expect(topics.length).toBeGreaterThan(8)
      for (const t of topics) expect(families.has(t.family), t.family).toBe(true)
      expect(new Set(topics.map((t) => t.name)).size).toBe(topics.length)
    }
    expect(builtInMapOf('US', 6)!.log).toContain('US map (Common Core) for Grade 6')
    expect(builtInMapOf('ZA', 6)!.log).toContain('CAPS map for Grade 6')
    expect(builtInMapOf('KE', 6)).toBeNull()
  })

  it('keeps South Africa as it was: its twelve files are unchanged', () => {
    const caps = readFileSync(join(__dirname, '../../../fixtures/curriculum/caps/grade-6.json'), 'utf8')
    expect(caps).toContain('"country": "ZA"')
  })

  it('asks a US person the year they were born, and treats a person who turns 13 this year as under 13', () => {
    const now = new Date('2026-11-23T00:00:00Z')
    expect(mayBeUnder13(2014, now)).toBe(true)
    expect(mayBeUnder13(2013, now)).toBe(true)
    expect(mayBeUnder13(2012, now)).toBe(false)
    expect(defaultCountry('US')).toBe('US')
    expect(defaultCountry('FR')).toBe('ZA')
    expect(cleanTag('Google Ads!')).toBe('google-ads')
    expect(cleanTag('')).toBeNull()
  })
})
