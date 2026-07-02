import { test, expect } from '@playwright/test';

test('ページが読み込めてゲームが起動する', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  const canvas = page.locator('#game');
  await expect(canvas).toBeVisible();

  // engine の状態が公開されていてタイトル画面になっている
  await page.waitForFunction(() => window.__game?.state?.status === 'title');

  // タップでゲーム開始
  await canvas.tap();
  await page.waitForFunction(() => window.__game?.state?.status === 'playing');

  expect(errors).toEqual([]);
});
