# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: p28.spec.ts >> child-sign-in >> a wrong PIN shows a kind message and clears the dots
- Location: e2e/p28.spec.ts:66:3

# Error details

```
Test timeout of 120000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - img "jemma" [ref=e6]:
        - generic [ref=e9]: emma
      - paragraph [ref=e10]: Each child's own tutor. Snap a test, Jemma finds the gaps and teaches them.
    - generic [ref=e11]:
      - heading "Sign in" [level=1] [ref=e12]
      - generic [ref=e13]:
        - generic [ref=e14]: Email
        - textbox "Email" [ref=e15]:
          - /placeholder: you@example.com
      - button "Send me a sign-in code" [ref=e16] [cursor=pointer]
      - paragraph [ref=e17]: We email you a 6 digit code. No password to remember.
    - generic [ref=e20]: New to Jemma?
    - link "Create an account" [ref=e22] [cursor=pointer]:
      - /url: /sign-up
    - link "Judging the challenge? Try the demo" [ref=e24] [cursor=pointer]:
      - /url: /demo
  - button "Open Next.js Dev Tools" [ref=e32] [cursor=pointer]
  - alert [ref=e36]
```