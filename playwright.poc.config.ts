import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/poc',
  testMatch: 'psd-poc.spec.ts',
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    launchOptions: {
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
})
