// src/renderer.js — Canvas描画のみ。state / ui を読み取り専用で扱い、絶対に変更しない。

import {
  WORLD, GRID, MAPS, TOWER_TYPES, towerStats, cellCenter, canBuildAt, makeWave,
} from './engine.js';
import { getButtons, PANEL_Y } from './layout.js';

const COLORS = {
  bg: '#1c2b21',
  grass: '#2e4a33',
  grassAlt: '#2a4530',
  path: '#c8a266',
  pathEdge: '#a5814c',
  hud: '#16211a',
  panel: '#16211a',
  button: '#2e4a3a',
  buttonActive: '#4a7a58',
  buttonDisabled: '#26332a',
  text: '#eef4e8',
  textDim: '#9db3a0',
  gold: '#ffd76a',
  danger: '#ff6a8a',
};

const TOWER_STYLE = {
  arrow: { color: '#7ec96f', icon: '🏹' },
  frost: { color: '#f0a8c0', icon: '⛩️' },
  cannon: { color: '#e8a15f', icon: '💥' },
  sniper: { color: '#c98fe8', icon: '🎯' },
};

export const ENEMY_STYLE = {
  normal: { body: '#bfe8f4', icon: '👻' },
  fast: { body: '#f0b48f', icon: '👺' },
  tank: { body: '#f08f8f', icon: '👹' },
  regen: { body: '#d4b48f', icon: '🦝' },
  shield: { body: '#c4cdd8', icon: '💀' },
  boss: { body: '#ffd76a', icon: '🦊' },
};

// マップテーマごとの飾り（道でも建設地でもない雰囲気づけ。当たり判定なし）
const THEME_DECO = {
  sakura: '🌸',
  bamboo: '🎋',
  castle: '🏮',
};

export function render(ctx, state, ui) {
  ctx.clearRect(0, 0, WORLD.w, WORLD.h);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  if (state.status === 'title') {
    drawTitle(ctx, state, ui);
    return;
  }

  drawField(ctx, state);
  drawGhost(ctx, state, ui);
  drawTowers(ctx, state, ui);
  drawEnemies(ctx, state);
  drawProjectiles(ctx, state);
  drawEffects(ctx, state);
  drawHud(ctx, state);
  drawPanel(ctx, state, ui);

  if (state.status === 'paused') drawOverlayScreen(ctx, state, ui, '⏸ ポーズ中', COLORS.text);
  if (state.status === 'gameover') drawOverlayScreen(ctx, state, ui, '💀 落城…', COLORS.danger);
  if (state.status === 'victory') drawOverlayScreen(ctx, state, ui, '🎌 討伐成功！', COLORS.gold);
}

// ---------------- タイトル ----------------
function drawTitle(ctx, state, ui) {
  const grad = ctx.createLinearGradient(0, 0, 0, WORLD.h);
  grad.addColorStop(0, '#1b2340');
  grad.addColorStop(0.6, '#3a2b45');
  grad.addColorStop(1, '#1c2b21');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  // 舞い散る桜
  ctx.font = '16px serif';
  ctx.globalAlpha = 0.7;
  const petals = [[30, 80], [320, 60], [70, 200], [300, 190], [40, 560], [330, 590], [180, 40]];
  for (const [px, py] of petals) ctx.fillText('🌸', px, py);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.font = '64px serif';
  ctx.fillText('🏯', WORLD.w / 2, 110);
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 36px serif';
  ctx.fillText('城まもり！', WORLD.w / 2, 165);
  ctx.fillStyle = COLORS.textDim;
  ctx.font = '14px serif';
  ctx.fillText('〜 和風タワーディフェンス 〜', WORLD.w / 2, 192);
  ctx.fillText('侍と巫女で妖怪の大軍勢からお城を守れ', WORLD.w / 2, 226);

  for (const b of getButtons(state, ui)) {
    drawButton(ctx, b, { big: true });
    if (b.cleared) {
      ctx.textAlign = 'right';
      ctx.font = '20px serif';
      ctx.fillText('⭐', b.x + b.w - 12, b.y + 30);
    }
  }

  ctx.fillStyle = COLORS.textDim;
  ctx.textAlign = 'center';
  ctx.font = '12px sans-serif';
  ctx.fillText('タップでマップを選択してスタート', WORLD.w / 2, 610);
}

// ---------------- フィールド ----------------
function drawField(ctx, state) {
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      ctx.fillStyle = (c + r) % 2 === 0 ? COLORS.grass : COLORS.grassAlt;
      ctx.fillRect(c * GRID.cell, GRID.top + r * GRID.cell, GRID.cell, GRID.cell);
    }
  }
  // 道
  for (const key of state.path.cells) {
    const [c, r] = key.split(',').map(Number);
    ctx.fillStyle = COLORS.path;
    ctx.fillRect(c * GRID.cell + 2, GRID.top + r * GRID.cell + 2, GRID.cell - 4, GRID.cell - 4);
    ctx.strokeStyle = COLORS.pathEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(c * GRID.cell + 2, GRID.top + r * GRID.cell + 2, GRID.cell - 4, GRID.cell - 4);
  }
  // テーマ飾り（決定的な配置。道と重ならない空きセルのみ）
  const deco = THEME_DECO[MAPS[state.mapIndex].theme] || '🌸';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '13px serif';
  ctx.globalAlpha = 0.5;
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      if (state.path.cells.has(`${c},${r}`)) continue;
      if ((c * 7 + r * 13) % 11 !== 0) continue;
      const { x, y } = cellCenter(c, r);
      ctx.fillText(deco, x + 9, y - 9);
    }
  }
  ctx.globalAlpha = 1;

  // 入口（鳥居）と出口（お城）
  const start = state.path.points[0];
  const goal = state.path.points[state.path.points.length - 1];
  ctx.font = '24px serif';
  ctx.fillText('⛩️', start.x, start.y);
  ctx.font = '26px serif';
  ctx.fillText('🏯', goal.x, goal.y);
  ctx.textBaseline = 'alphabetic';
}

function drawGhost(ctx, state, ui) {
  if (state.status !== 'playing' || !ui.buildType || !ui.hoverCell) return;
  const { c, r } = ui.hoverCell;
  const ok = canBuildAt(state, c, r) && state.gold >= TOWER_TYPES[ui.buildType].cost;
  const { x, y } = cellCenter(c, r);
  const range = TOWER_TYPES[ui.buildType].levels[0].range;
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = ok ? '#8fd4a0' : COLORS.danger;
  ctx.beginPath();
  ctx.arc(x, y, range, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = ok ? '#8fd4a0' : COLORS.danger;
  ctx.fillRect(c * GRID.cell + 4, GRID.top + r * GRID.cell + 4, GRID.cell - 8, GRID.cell - 8);
  ctx.globalAlpha = 1;
}

// ---------------- タワー ----------------
function drawTowers(ctx, state, ui) {
  for (const t of state.towers) {
    const style = TOWER_STYLE[t.type];
    const stats = towerStats(t);

    if (ui.selectedTowerId === t.id) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(t.x, t.y, stats.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(t.x, t.y, stats.range, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 台座
    ctx.fillStyle = '#22331f';
    ctx.beginPath();
    ctx.arc(t.x, t.y + 2, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '16px serif';
    ctx.fillText(style.icon, t.x, t.y - 1);
    ctx.textBaseline = 'alphabetic';

    // レベルピップ
    ctx.fillStyle = COLORS.gold;
    for (let i = 0; i < t.level; i++) {
      ctx.beginPath();
      ctx.arc(t.x - 8 + i * 8, t.y + 14, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------------- 敵 ----------------
function drawEnemies(ctx, state) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const e of state.enemies) {
    const style = ENEMY_STYLE[e.type];
    const slowed = e.slowTimer > 0;

    // 足元の影と体のオーラ
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = slowed ? '#8fc4e8' : style.body;
    ctx.beginPath();
    ctx.arc(e.x, e.y + 2, e.radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 妖怪本体（絵文字キャラ）
    ctx.font = `${Math.round(e.radius * 2.1)}px serif`;
    ctx.fillText(style.icon, e.x, e.y);

    if (slowed) {
      // お札の呪縛エフェクト
      ctx.strokeStyle = '#9fdcff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.type === 'boss') {
      ctx.font = '14px serif';
      ctx.fillText('👑', e.x, e.y - e.radius - 17);
    }
    if (e.type === 'shield') {
      ctx.strokeStyle = '#dce8f4';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // HPバー
    const w = e.radius * 2;
    const ratio = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 9, w, 4);
    ctx.fillStyle = ratio > 0.5 ? '#7ec96f' : ratio > 0.25 ? '#ffd76a' : '#ff6a8a';
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 9, w * ratio, 4);
  }
  ctx.textBaseline = 'alphabetic';
}

// ---------------- 弾・エフェクト ----------------
function drawProjectiles(ctx, state) {
  for (const p of state.projectiles) {
    const style = TOWER_STYLE[p.type];
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.type === 'cannon' ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEffects(ctx, state) {
  for (const fx of state.effects) {
    const k = fx.max ? Math.max(0, fx.ttl / fx.max) : 1;
    if (fx.kind === 'boom') {
      ctx.globalAlpha = k * 0.6;
      ctx.fillStyle = '#ffb05f';
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r * (1.2 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'pop') {
      ctx.globalAlpha = k;
      ctx.strokeStyle = fx.color || '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r * (1.4 - k * 0.4), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'beam') {
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#e8d5ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'text') {
      ctx.globalAlpha = Math.min(1, fx.ttl * 2.5);
      ctx.fillStyle = fx.color || COLORS.text;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(fx.text, fx.x, fx.y);
      ctx.globalAlpha = 1;
    }
  }
}

// ---------------- HUD / パネル ----------------
function drawHud(ctx, state) {
  ctx.fillStyle = COLORS.hud;
  ctx.fillRect(0, 0, WORLD.w, GRID.top);
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = COLORS.danger;
  ctx.fillText(`❤️ ${state.lives}`, 10, 30);
  ctx.fillStyle = COLORS.gold;
  ctx.fillText(`💰 ${state.gold}`, 88, 30);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(`🌊 ${state.wave}/${state.totalWaves}`, 188, 30);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.textDim;
  ctx.font = '12px sans-serif';
  ctx.fillText(`SCORE ${state.score}`, WORLD.w - 8, 30);
}

function drawPanel(ctx, state, ui) {
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(0, PANEL_Y, WORLD.w, WORLD.h - PANEL_Y);

  const selected = ui.selectedTowerId != null
    ? state.towers.find((t) => t.id === ui.selectedTowerId)
    : null;

  for (const b of getButtons(state, ui)) drawButton(ctx, b, {});

  if (selected) {
    // 選択中タワーの情報をパネル上端に薄く出す
    const def = TOWER_TYPES[selected.type];
    const stats = towerStats(selected);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${def.name} Lv${selected.level}  攻撃${stats.dmg}  射程${stats.range}  撃破${selected.kills}`,
      WORLD.w / 2, PANEL_Y - 6,
    );
  } else if (ui.buildType) {
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${TOWER_TYPES[ui.buildType].desc} — 置きたいマスをタップ`, WORLD.w / 2, PANEL_Y - 6);
  } else if (!state.waveActive && state.wave < state.totalWaves) {
    // 次ウェーブの妖怪予告
    const next = makeWave(state.mapIndex, state.wave + 1);
    const counts = {};
    for (const e of next.entries) counts[e.type] = (counts[e.type] || 0) + 1;
    const preview = Object.entries(counts)
      .map(([type, n]) => `${ENEMY_STYLE[type].icon}×${n}`)
      .join('  ');
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`つぎの妖怪: ${preview}`, WORLD.w / 2, PANEL_Y - 6);
  }
}

function drawButton(ctx, b, { big = false } = {}) {
  ctx.fillStyle = !b.enabled ? COLORS.buttonDisabled : b.active ? COLORS.buttonActive : COLORS.button;
  roundRect(ctx, b.x, b.y, b.w, b.h, 10);
  ctx.fill();
  if (b.active) {
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 2;
    roundRect(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.stroke();
  }
  ctx.fillStyle = b.enabled ? COLORS.text : COLORS.textDim;
  ctx.textAlign = 'center';
  if (big) {
    ctx.font = 'bold 19px sans-serif';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + 38);
    if (b.sub) {
      ctx.fillStyle = COLORS.textDim;
      ctx.font = '12px sans-serif';
      ctx.fillText(b.sub, b.x + b.w / 2, b.y + 64);
    }
  } else if (b.sub) {
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + 23);
    ctx.fillStyle = b.enabled ? COLORS.gold : COLORS.textDim;
    ctx.font = '12px sans-serif';
    ctx.fillText(b.sub, b.x + b.w / 2, b.y + 41);
  } else {
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 5);
  }
}

function drawOverlayScreen(ctx, state, ui, title, color) {
  ctx.fillStyle = 'rgba(10, 16, 12, 0.78)';
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(title, WORLD.w / 2, 250);

  ctx.fillStyle = COLORS.text;
  ctx.font = '15px sans-serif';
  if (state.status === 'victory') {
    ctx.fillText(`${MAPS[state.mapIndex].name} を妖怪から守りきった！`, WORLD.w / 2, 300);
    ctx.fillStyle = COLORS.gold;
    ctx.fillText(`SCORE ${state.score}  ❤️のこり ${state.lives}`, WORLD.w / 2, 330);
  } else if (state.status === 'gameover') {
    ctx.fillText(`WAVE ${state.wave} でお城が落ちた…`, WORLD.w / 2, 300);
    ctx.fillStyle = COLORS.gold;
    ctx.fillText(`SCORE ${state.score}`, WORLD.w / 2, 330);
  }

  for (const b of getButtons(state, ui)) drawButton(ctx, b, {});
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
