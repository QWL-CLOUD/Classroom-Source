import { defineConfig, devices } from '@playwright/test';

const host = '127.0.0.1';
const port = 4173;
const appBase = '/Classroom-Source/';
const appUrl = `http://${host}:${port}${appBase}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: appUrl,
    trace: 'on-first-retry',
  },

  webServer: {
    command: `npm run build && npm run preview -- --host ${host} --port ${port} --strictPort --base ${appBase}`,
    url: appUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit-pilot',
      testMatch: /personal-pilot-readiness\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
