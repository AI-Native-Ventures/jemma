import { defineConfig } from '@playwright/test'

// One Electron instance at a time: --workers=1 (also set in the e2e script).
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  // Other workers share this Mac and spawning the agent CLIs is slow under load: be patient.
  timeout: 120_000,
  expect: { timeout: 20_000 },
})
