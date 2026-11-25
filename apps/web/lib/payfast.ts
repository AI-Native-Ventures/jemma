import { createHash } from 'node:crypto'

// PayFast (P161): the payment page a parent is sent to, the notice PayFast sends back for each payment (its ITN), and PayFast's API for a
// subscription (cancel, change the amount). The merchant id, key and passphrase are Worker secrets the owner sets: this file never logs them.
// PayFast's own rules, as their developer documents give them:
// - a payment page's fields go in a fixed order, and the signature is the MD5 of `key=value&...` of the fields that are not empty, in that order,
//   each value trimmed and URL-encoded as PHP's urlencode does (a space is "+"), with `&passphrase=...` at the end;
// - a notice is checked four ways before it is believed: its signature, where it came from, its amount, and PayFast's answer "VALID" to the same
//   fields sent back to them;
// - an API call is signed with the MD5 of every header and body value and the passphrase, sorted by name.

export type PayfastEnv = { merchantId: string; merchantKey: string; passphrase: string; sandbox: boolean }

/** PayFast's settings from the Worker, or null while the owner has not set them (the screens then say plans open soon). */
export function payfastEnv(env: Record<string, string | undefined> = process.env): PayfastEnv | null {
  const merchantId = (env.PAYFAST_MERCHANT_ID ?? '').trim()
  const merchantKey = (env.PAYFAST_MERCHANT_KEY ?? '').trim()
  const passphrase = (env.PAYFAST_PASSPHRASE ?? '').trim()
  if (!merchantId || !merchantKey || !passphrase) return null
  return { merchantId, merchantKey, passphrase, sandbox: env.PAYFAST_SANDBOX === '1' }
}

const host = (sandbox: boolean) => (sandbox ? 'https://sandbox.payfast.co.za' : 'https://www.payfast.co.za')
export const processUrl = (sandbox: boolean) => `${host(sandbox)}/eng/process`
export const validateUrl = (sandbox: boolean) => `${host(sandbox)}/eng/query/validate`
/** PayFast's own page where a parent puts in a new card for a subscription, and comes back to `back`. */
export const cardUpdateUrl = (token: string, back: string, sandbox: boolean) => `${host(sandbox)}/eng/recurring/update/${encodeURIComponent(token)}?return=${encodeURIComponent(back)}`

/** A value as PHP's urlencode writes it: letters, digits and `-_.` as they are, a space as "+", everything else as %XX in capitals. */
export function pfEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`).replace(/%20/g, '+')
}

const md5 = (text: string) => createHash('md5').update(text, 'utf8').digest('hex')

/** The signature of fields in the order given: the empty ones left out, each value trimmed, the passphrase last. */
export function signOrdered(fields: [string, string][], passphrase: string): string {
  const parts = fields.filter(([, v]) => v.trim() !== '').map(([k, v]) => `${k}=${pfEncode(v.trim())}`)
  if (passphrase) parts.push(`passphrase=${pfEncode(passphrase.trim())}`)
  return md5(parts.join('&'))
}

/** PayFast's order of the fields of a payment page (the ones Jemma sends). */
const ORDER = [
  'merchant_id', 'merchant_key', 'return_url', 'cancel_url', 'notify_url',
  'name_first', 'name_last', 'email_address',
  'm_payment_id', 'amount', 'item_name', 'item_description', 'custom_str1', 'custom_str2',
  'email_confirmation', 'confirmation_address',
  'subscription_type', 'billing_date', 'recurring_amount', 'frequency', 'cycles',
] as const

export type CheckoutInput = {
  returnUrl: string
  cancelUrl: string
  notifyUrl: string
  /** Jemma's own number of the payment: `sub_<id>` for a plan, `up_<id>` for the difference of a bigger plan. */
  paymentId: string
  /** Rand, as PayFast writes it: "1630.00". */
  amount: string
  itemName: string
  itemDescription?: string
  email?: string | null
  /** A yearly subscription: the amount of each later year and the day of the first of them (YYYY-MM-DD). Left out for a payment of once. */
  subscription?: { recurringAmount: string; billingDate: string }
}

/** The fields of the form that sends a parent to PayFast, in PayFast's order, signed. */
export function checkoutFields(env: PayfastEnv, input: CheckoutInput): [string, string][] {
  const values: Record<string, string> = {
    merchant_id: env.merchantId,
    merchant_key: env.merchantKey,
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    notify_url: input.notifyUrl,
    email_address: input.email ?? '',
    m_payment_id: input.paymentId,
    amount: input.amount,
    item_name: input.itemName.slice(0, 100),
    item_description: (input.itemDescription ?? '').slice(0, 255),
    ...(input.subscription
      ? { subscription_type: '1', billing_date: input.subscription.billingDate, recurring_amount: input.subscription.recurringAmount, frequency: '6', cycles: '0' }
      : {}),
  }
  const fields = ORDER.filter((k) => (values[k] ?? '') !== '').map((k) => [k, values[k]!] as [string, string])
  return [...fields, ['signature', signOrdered(fields, env.passphrase)]]
}

/** The fields of a notice as they came, in order, without the signature: what the signature covers and what goes back to PayFast. */
export function itnParamString(entries: [string, string][]): string {
  return entries
    .filter(([k]) => k !== 'signature')
    .map(([k, v]) => `${k}=${pfEncode(v.trim())}`)
    .join('&')
}

/** Check 1: the notice's own signature is right for these fields and the passphrase. */
export function itnSignatureOk(entries: [string, string][], passphrase: string): boolean {
  const given = entries.find(([k]) => k === 'signature')?.[1] ?? ''
  const base = itnParamString(entries)
  const expected = md5(passphrase ? `${base}&passphrase=${pfEncode(passphrase.trim())}` : base)
  return given.length === 32 && given.toLowerCase() === expected
}

/** Check 3: the amount PayFast took is the amount Jemma asked for (to the cent). */
export function amountMatches(amountGross: string | undefined, expectedZarCents: number): boolean {
  const n = Number(amountGross)
  return Number.isFinite(n) && Math.abs(Math.round(n * 100) - expectedZarCents) <= 1
}

/** PayFast's hosts that send notices. Check 2 resolves them and compares the address the notice came from. */
export const PAYFAST_HOSTS = ['www.payfast.co.za', 'sandbox.payfast.co.za', 'w1w.payfast.co.za', 'w2w.payfast.co.za']

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** Check 2: the notice came from one of PayFast's addresses (looked up with Cloudflare's DNS over HTTPS). */
export async function fromPayfast(ip: string | null, fetchFn: Fetch = fetch): Promise<boolean> {
  if (!ip) return false
  const lists = await Promise.all(
    PAYFAST_HOSTS.map(async (h) => {
      try {
        const res = await fetchFn(`https://cloudflare-dns.com/dns-query?name=${h}&type=A`, { headers: { accept: 'application/dns-json' } })
        const body = (await res.json()) as { Answer?: { type: number; data: string }[] }
        return (body.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data)
      } catch {
        return []
      }
    }),
  )
  return lists.flat().includes(ip)
}

/** Check 4: PayFast says the same fields are a notice of theirs ("VALID"). */
export async function confirmedByPayfast(entries: [string, string][], sandbox: boolean, fetchFn: Fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchFn(validateUrl(sandbox), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: itnParamString(entries) })
    return (await res.text()).trim() === 'VALID'
  } catch {
    return false
  }
}

/** The signature of an API call: every header and body value and the passphrase, sorted by name, URL-encoded. */
export function apiSignature(values: Record<string, string>, passphrase: string): string {
  const all: Record<string, string> = { ...values, passphrase }
  const text = Object.keys(all)
    .sort()
    .filter((k) => all[k] !== '')
    .map((k) => `${k}=${pfEncode(all[k]!.trim())}`)
    .join('&')
  return md5(text)
}

/** PayFast's timestamp of an API call: the time without its milliseconds, in UTC ("2026-11-23T19:05:00+00:00"). */
export const apiTimestamp = (now: Date) => `${now.toISOString().slice(0, 19)}+00:00`

export type ApiResult = { ok: boolean; status: number; text: string }

/** One call to PayFast's subscription API: `cancel`, or `update` with a new yearly amount (rand cents). In the sandbox, `?testing=true`. */
export async function subscriptionCall(
  env: PayfastEnv,
  token: string,
  action: { kind: 'cancel' } | { kind: 'update'; amountZarCents: number },
  now: Date = new Date(),
  fetchFn: Fetch = fetch,
): Promise<ApiResult> {
  const headers: Record<string, string> = { 'merchant-id': env.merchantId, version: 'v1', timestamp: apiTimestamp(now) }
  const body: Record<string, string> = action.kind === 'update' ? { amount: String(action.amountZarCents) } : {}
  headers.signature = apiSignature({ ...headers, ...body }, env.passphrase)
  const path = action.kind === 'cancel' ? 'cancel' : 'update'
  const url = `https://api.payfast.co.za/subscriptions/${encodeURIComponent(token)}/${path}${env.sandbox ? '?testing=true' : ''}`
  try {
    const res = await fetchFn(url, {
      method: action.kind === 'cancel' ? 'PUT' : 'PATCH',
      headers: { ...headers, 'content-type': 'application/json' },
      ...(action.kind === 'update' ? { body: JSON.stringify({ amount: action.amountZarCents }) } : {}),
    })
    return { ok: res.ok, status: res.status, text: (await res.text()).slice(0, 500) }
  } catch (e) {
    return { ok: false, status: 0, text: e instanceof Error ? e.message : String(e) }
  }
}
