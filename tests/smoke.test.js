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

  // ドラッグでひらりちゃんが動く
  const before = await page.evaluate(() => window.__game.state.player.x);
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.8, {
    steps: 10,
  });
  await page.mouse.up();
  await page.waitForFunction(
    (x0) => Math.abs(window.__game.state.player.x - x0) > 20,
    before,
  );

  expect(errors).toEqual([]);
});
