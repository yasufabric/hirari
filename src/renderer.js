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
    return;
  }

  for (const o of state.obstacles) {
    drawObstacle(ctx, o);
  }

  // 無敵中は点滅させる
  const flashing =
    state.invincibleTimer > 0 && Math.floor(state.time * 12) % 2 === 0;
  if (!flashing) {
    drawPlayer(ctx, state.player);
  }

  drawHud(ctx, state);

  if (state.status === 'gameover') {
    drawGameOver(ctx, state);
  } else if (state.status === 'skillSelect') {
    drawSkillSelect(ctx, state);
  }
}

// スキルカードの矩形（論理座標）。main.js のヒットテストでも使う。
export function skillCardRects(world) {
  const w = 300;
  const h = 100;
  const gap = 22;
  const x = (world.width - w) / 2;
  const startY = 170;
  return [0, 1, 2].map((i) => ({ x, y: startY + i * (h + gap), w, h }));
}

function drawHud(ctx, state) {
  // HPハート（左上）
  for (let i = 0; i < state.maxHp; i++) {
    ctx.save();
    ctx.translate(24 + i * 30, 26);
    ctx.globalAlpha = i < state.hp ? 1 : 0.25;
    drawHeart(ctx, 11);
    ctx.restore();
  }
  // シールド（ハートの下に小さな盾マーク）
  for (let i = 0; i < state.shield; i++) {
    ctx.save();
    ctx.translate(20 + i * 18, 50);
    ctx.fillStyle = '#8fc7ff';
    ctx.strokeStyle = '#4a8fd6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(6, -3);
    ctx.lineTo(6, 2);
    ctx.quadraticCurveTo(6, 7, 0, 9);
    ctx.quadraticCurveTo(-6, 7, -6, 2);
    ctx.lineTo(-6, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // スコア（右上）
  ctx.save();
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7a6a8a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`SCORE ${state.score}`, state.world.width - 14, 32);

  // ステージ番号（中央上）＋残り時間バー
  ctx.textAlign = 'center';
  ctx.fillText(`STAGE ${state.stage}`, state.world.width / 2, 32);
  const barW = 120;
  const barX = (state.world.width - barW) / 2;
  const remain = Math.max(0, 1 - state.stageTime / state.stageDuration);
  ctx.fillStyle = 'rgba(122, 106, 138, 0.25)';
  ctx.fillRect(barX, 40, barW, 6);
  ctx.fillStyle = '#e05a8a';
  ctx.fillRect(barX, 40, barW * remain, 6);
  ctx.restore();
}

function drawSkillSelect(ctx, state) {
  const { width, height } = state.world;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 217, 236, 0.9)';
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e05a8a';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(`ステージ ${state.stage} クリア！`, width / 2, 80);
  ctx.fillStyle = '#7a6a8a';
  ctx.font = '16px sans-serif';
  ctx.fillText('スキルをひとつ選んでね', width / 2, 115);

  const rects = skillCardRects(state.world);
  const choices = state.skillChoices ?? [];
  choices.forEach((skill, i) => {
    const rect = rects[i];
    if (!rect) return;
    // カード本体
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ff8fb3';
    ctx.lineWidth = 3;
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14);
    ctx.fill();
    ctx.stroke();
    // テキスト
    ctx.fillStyle = '#e05a8a';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(skill.name, width / 2, rect.y + 42);
    ctx.fillStyle = '#7a6a8a';
    ctx.font = '14px sans-serif';
    ctx.fillText(skill.desc, width / 2, rect.y + 72);
  });
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawGameOver(ctx, state) {
  const { width, height } = state.world;
  ctx.save();
  ctx.fillStyle = 'rgba(42, 36, 56, 0.7)';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText('ゲームオーバー', width / 2, height / 2 - 40);
  ctx.font = '20px sans-serif';
  ctx.fillText(`スコア: ${state.score}`, width / 2, height / 2 + 10);
  ctx.fillStyle = '#ffd9ec';
  ctx.font = '16px sans-serif';
  ctx.fillText('タップでもう一度', width / 2, height / 2 + 60);
  ctx.restore();
}

function drawObstacle(ctx, o) {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.angle);
  if (o.type === 'star') {
    drawStar(ctx, o.r);
  } else if (o.type === 'heart') {
    drawHeart(ctx, o.r);
  } else {
    drawBubble(ctx, o.r);
  }
  ctx.restore();
}

function drawStar(ctx, r) {
  ctx.fillStyle = '#ffd24a';
  ctx.strokeStyle = '#f0a828';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const outer = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const inner = outer + Math.PI / 5;
    const method = i === 0 ? 'moveTo' : 'lineTo';
    ctx[method](Math.cos(outer) * r, Math.sin(outer) * r);
    ctx.lineTo(Math.cos(inner) * r * 0.45, Math.sin(inner) * r * 0.45);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawHeart(ctx, r) {
  ctx.fillStyle = '#ff6f9c';
  ctx.strokeStyle = '#e0487a';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.9);
  ctx.bezierCurveTo(-r * 1.2, r * 0.1, -r * 0.7, -r * 0.9, 0, -r * 0.3);
  ctx.bezierCurveTo(r * 0.7, -r * 0.9, r * 1.2, r * 0.1, 0, r * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawBubble(ctx, r) {
  ctx.fillStyle = 'rgba(150, 210, 255, 0.55)';
  ctx.strokeStyle = 'rgba(90, 160, 230, 0.9)';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // ハイライト
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.beginPath();
  ctx.arc(-r * 0.35, -r * 0.35, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

// ひらりちゃん（小さな女の子）。r を基準にパーツを配置する。
function drawPlayer(ctx, p) {
  const { x, y, r } = p;
  ctx.save();
  ctx.translate(x, y);
  const s = r / 16; // 基準サイズ16pxからのスケール

  // ワンピース（スカート）
  ctx.fillStyle = '#ff8fb3';
  ctx.beginPath();
  ctx.moveTo(0, 2 * s);
  ctx.lineTo(-11 * s, 15 * s);
  ctx.quadraticCurveTo(0, 19 * s, 11 * s, 15 * s);
  ctx.closePath();
  ctx.fill();

  // 顔
  ctx.fillStyle = '#ffe8d6';
  ctx.beginPath();
  ctx.arc(0, -4 * s, 9 * s, 0, Math.PI * 2);
  ctx.fill();

  // 髪（前髪＋サイド）
  ctx.fillStyle = '#8a5a3b';
  ctx.beginPath();
  ctx.arc(0, -6 * s, 9.5 * s, Math.PI * 0.95, Math.PI * 2.05);
  ctx.quadraticCurveTo(11 * s, 2 * s, 8 * s, 6 * s);
  ctx.quadraticCurveTo(9 * s, -2 * s, 5 * s, -3 * s);
  ctx.quadraticCurveTo(0, -1 * s, -5 * s, -3 * s);
  ctx.quadraticCurveTo(-9 * s, -2 * s, -8 * s, 6 * s);
  ctx.quadraticCurveTo(-11 * s, 2 * s, -9.5 * s, -6 * s);
  ctx.closePath();
  ctx.fill();

  // リボン
  ctx.fillStyle = '#ff4f8b';
  ctx.beginPath();
  ctx.arc(6 * s, -12 * s, 2.5 * s, 0, Math.PI * 2);
  ctx.fill();

  // 目
  ctx.fillStyle = '#3a2a2a';
  ctx.beginPath();
  ctx.arc(-3 * s, -4 * s, 1.3 * s, 0, Math.PI * 2);
  ctx.arc(3 * s, -4 * s, 1.3 * s, 0, Math.PI * 2);
  ctx.fill();

  // ほっぺ
  ctx.fillStyle = 'rgba(255, 130, 160, 0.5)';
  ctx.beginPath();
  ctx.arc(-5.5 * s, -1.5 * s, 1.6 * s, 0, Math.PI * 2);
  ctx.arc(5.5 * s, -1.5 * s, 1.6 * s, 0, Math.PI * 2);
  ctx.fill();

  // 口
  ctx.strokeStyle = '#c96a6a';
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.arc(0, -1.5 * s, 1.8 * s, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();

  ctx.restore();
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
