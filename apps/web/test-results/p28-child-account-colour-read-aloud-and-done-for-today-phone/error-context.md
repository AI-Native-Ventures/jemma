# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: p28.spec.ts >> child-account >> colour, read aloud and done for today
- Location: e2e/p28.spec.ts:123:3

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByRole('heading', { level: 1 })
Expected: "Hi! Sign in to your Jemma."
Received: "Sign in"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" getByRole('heading', { level: 1 }) with timeout 5000ms
  - waiting for getByRole('heading', { level: 1 })
    14 × locator resolved to <h1>Sign in</h1>
       - unexpected value "Sign in"

```

```yaml
- heading "Sign in" [level=1]
```

# Test source

```ts
  44  |       await page.context().clearCookies()
  45  |       await page.goto('/k/sign-in')
  46  |       await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hi! Sign in to your Jemma.')
  47  |       await expect(page.getByText('Your code', { exact: true })).toBeVisible()
  48  |       await expect(page.getByText('Your PIN', { exact: true })).toBeVisible()
  49  |       await expect(page.getByText('Forgot your PIN? Ask a grown-up.')).toBeVisible()
  50  |       await page.getByLabel('Your code').fill(creds.code)
  51  |       await typePin(page, creds.pin.slice(0, 2))
  52  |       await expect(page.getByText('2 of 4 digits typed')).toBeAttached()
  53  |       await noHorizontalScroll(page)
  54  |       await shot(page, testInfo, 'child-sign-in')
  55  |       await page.getByRole('button', { name: 'Delete' }).click()
  56  |       await expect(page.getByText('1 of 4 digits typed')).toBeAttached()
  57  |       await typePin(page, creds.pin.slice(1))
  58  |       await page.getByRole('button', { name: 'Sign in' }).click()
  59  |       await page.waitForURL('**/k')
  60  |       await expect(page).toHaveURL(/\/k$/)
  61  |     } finally {
  62  |       await sb.cleanup()
  63  |     }
  64  |   })
  65  | 
  66  |   test('a wrong PIN shows a kind message and clears the dots', async ({ page }) => {
  67  |     const sb = await openSandbox(page, { stage: 'start', role: 'learner' })
  68  |     try {
  69  |       const creds = await learnerCreds(sb.sandboxId)
  70  |       await page.context().clearCookies()
  71  |       await page.goto('/k/sign-in')
  72  |       const wrong = creds.pin === '0000' ? '1111' : '0000'
  73  |       await page.getByLabel('Your code').fill(creds.code)
  74  |       await typePin(page, wrong)
  75  |       await page.getByRole('button', { name: 'Sign in' }).click()
  76  |       await expect(page.getByText('That code or PIN is not right. Check it and try again.')).toBeVisible()
  77  |       await expect(page.getByText('0 of 4 digits typed')).toBeAttached()
  78  |       await expect(page).toHaveURL(/\/k\/sign-in/)
  79  |     } finally {
  80  |       await sb.cleanup()
  81  |     }
  82  |   })
  83  | })
  84  | 
  85  | test.describe('child-gaps', () => {
  86  |   test('after the first session: 1 practising, fixed ones listed', async ({ page }, testInfo) => {
  87  |     const sb = await openSandbox(page, { stage: 'session_done', role: 'learner' })
  88  |     try {
  89  |       await page.goto('/k/gaps')
  90  |       await expect(page.getByRole('heading', { level: 1 })).toHaveText(/You're fixing \d+ gaps?\. 3 are already fixed\./)
  91  |       const fixed = page.getByRole('region', { name: 'Fixed' })
  92  |       await expect(fixed.getByRole('listitem')).toHaveCount(3)
  93  |       await expect(fixed.getByText('Equivalent fractions')).toBeVisible()
  94  |       await expect(fixed.getByText('Ordering whole numbers')).toBeVisible()
  95  |       await expect(fixed.getByText('Rounding off')).toBeVisible()
  96  |       await expect(page.getByText('Fixed means you got it right again days later, so it stuck.')).toBeVisible()
  97  |       const practising = page.getByRole('region', { name: 'Practising' })
  98  |       await expect(practising.getByText('Adding fractions', { exact: true })).toBeVisible()
  99  |       await expect(practising.getByText(/^Moved here tonight\./)).toBeVisible()
  100 |       const fresh = page.getByRole('region', { name: 'New', exact: true })
  101 |       await expect(fresh.getByText('Adding decimals')).toBeVisible()
  102 |       await expect(fresh.getByRole('link', { name: 'Practise' })).toBeVisible()
  103 |       await noHorizontalScroll(page)
  104 |       await shot(page, testInfo, 'child-gaps')
  105 |     } finally {
  106 |       await sb.cleanup()
  107 |     }
  108 |   })
  109 | 
  110 |   test('before any session every unfixed gap is New', async ({ page }) => {
  111 |     const sb = await openSandbox(page, { stage: 'marked', role: 'learner' })
  112 |     try {
  113 |       await page.goto('/k/gaps')
  114 |       await expect(page.getByRole('region', { name: 'Practising' })).toHaveCount(0)
  115 |       await expect(page.getByRole('region', { name: 'New', exact: true }).getByRole('link', { name: 'Practise' }).first()).toBeVisible()
  116 |     } finally {
  117 |       await sb.cleanup()
  118 |     }
  119 |   })
  120 | })
  121 | 
  122 | test.describe('child-account', () => {
  123 |   test('colour, read aloud and done for today', async ({ page }, testInfo) => {
  124 |     const sb = await openSandbox(page, { stage: 'session_done', role: 'learner' })
  125 |     try {
  126 |       await page.goto('/k/me')
  127 |       await expect(page.getByRole('heading', { level: 1 })).toHaveText("That's you, Amina!")
  128 |       await expect(page.getByText('A grown-up can change your PIN.')).toBeVisible()
  129 |       await expect(page.getByRole('button', { name: 'Peach' })).toHaveAttribute('aria-pressed', 'true')
  130 |       const aloud = page.getByRole('button', { name: /Read questions out loud/ })
  131 |       await expect(aloud).toHaveAttribute('aria-pressed', 'false')
  132 |       await expect(page.getByText('Jemma reads each question to you')).toBeVisible()
  133 |       await noHorizontalScroll(page)
  134 |       await shot(page, testInfo, 'child-account')
  135 |       await page.getByRole('button', { name: 'Lilac' }).click()
  136 |       await expect(page.getByRole('button', { name: 'Lilac' })).toHaveAttribute('aria-pressed', 'true')
  137 |       await aloud.click()
  138 |       await expect(aloud).toHaveAttribute('aria-pressed', 'true')
  139 |       await page.reload()
  140 |       await expect(page.getByRole('button', { name: 'Lilac' })).toHaveAttribute('aria-pressed', 'true')
  141 |       await expect(page.getByRole('button', { name: /Read questions out loud/ })).toHaveAttribute('aria-pressed', 'true')
  142 |       await page.getByRole('button', { name: "I'm done for today" }).click()
  143 |       await page.waitForURL('**/k/sign-in')
> 144 |       await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hi! Sign in to your Jemma.')
      |                                                             ^ Error: expect(locator).toHaveText(expected) failed
  145 |     } finally {
  146 |       await sb.cleanup()
  147 |     }
  148 |   })
  149 | })
  150 | 
```