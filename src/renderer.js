// renderer.js — Canvas描画のみ。state は読み取り専用。
// 論理座標 360×640 で描く。スケーリングは main.js が ctx.setTransform で行う。

const BG_TOP = '#ffd9ec';
const BG_BOTTOM = '#d9e8ff';

export function render(ctx, state) {
  const { width, height } = state.world;

  // 背景（パステルグラデーション）
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, BG_TOP);
  grad.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  if (state.status === 'title') {
    drawTitle(ctx, state);
  }
}

function drawTitle(ctx, state) {
  const { width, height } = state.world;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e05a8a';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('ひらり', width / 2, height / 2 - 40);
  ctx.fillStyle = '#7a6a8a';
  ctx.font = '18px sans-serif';
  ctx.fillText('タップしてスタート', width / 2, height / 2 + 20);
  ctx.restore();
}
