import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// CI等でプリインストール済みChromiumがあればそれを使う
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';

export default defineConfig({
  testMatch: 'tests/smoke.test.js',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:8787',
    viewport: { width: 390, height: 844 }, // スマホ相当
    hasTouch: true,
    launchOptions: existsSync(PREINSTALLED_CHROMIUM)
      ? { executablePath: PREINSTALLED_CHROMIUM }
      : {},
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    port: 8787,
    reuseExistingServer: true,
  },
});
