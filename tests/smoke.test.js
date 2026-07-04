import { test, expect } from '@playwright/test';

// 論理座標 → 画面座標（canvas左上基準のCSSピクセル）に変換してクリックする
async function tapWorld(page, canvas, x, y) {
  const view = await page.evaluate(([wx, wy]) => window.__game.worldToView(wx, wy), [x, y]);
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + view.x, box.y + view.y);
}

async function tapButton(page, canvas, id) {
  const b = await page.evaluate(
    (bid) => window.__game.buttons().find((btn) => btn.id === bid),
    id,
  );
  expect(b, `button ${id} should exist`).toBeTruthy();
  await tapWorld(page, canvas, b.x + b.w / 2, b.y + b.h / 2);
}

test('ページが読み込めてタワーディフェンスが遊べる', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  const canvas = page.locator('#game');
  await expect(canvas).toBeVisible();

  // タイトル画面から開始
  await page.waitForFunction(() => window.__game?.state?.status === 'title');
  await tapButton(page, canvas, 'map-0');
  await page.waitForFunction(() => window.__game.state.status === 'playing');

  // 弓侍を選んで空きマス(4,2)に建てる
  await tapButton(page, canvas, 'build-arrow');
  await page.waitForFunction(() => window.__game.ui.buildType === 'arrow');
  await tapWorld(page, canvas, 4 * 40 + 20, 48 + 2 * 40 + 20);
  await page.waitForFunction(() => window.__game.state.towers.length === 1);

  // ウェーブ開始 → 妖怪がスポーンする
  await tapButton(page, canvas, 'wave-start');
  await page.waitForFunction(() => window.__game.state.waveActive === true);
  await page.waitForFunction(() => window.__game.state.enemies.length > 0);

  expect(errors).toEqual([]);
});
