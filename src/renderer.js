// src/renderer.js — Canvas描画のみ。state / ui を読み取り専用で扱い、絶対に変更しない。
// t は演出用の実時間（秒）。main.js から渡される。ゲームロジックには一切影響しない。

import {
  WORLD, GRID, MAPS, TOWER_TYPES, towerStats, cellCenter, canBuildAt, makeWave,
} from './engine.js';
import { getButtons, PANEL_Y } from './layout.js';

// ---------------- パレット（和風） ----------------
const P = {
  night0: '#0e1226', night1: '#2b2142', night2: '#3d2b3a',
  grass: '#649c4e', grassDark: '#578a44', grassDeep: '#4c7a3c',
  pathEdge: '#a97f4a', path: '#d9b077', pathLight: '#e6c690',
  ink: '#171221', panel: '#1d1626', panelHi: '#2a2136',
  gold: '#d9b45f', goldHi: '#f2d489',
  cream: '#f5eeda', dim: '#a99bb0',
  vermil: '#c73e2e', vermilHi: '#e05a40', vermilDeep: '#8e2a1e',
  danger: '#ff6a7a', good: '#7ec96f',
};

const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
const SANS = '"Hiragino Sans", "Yu Gothic", sans-serif';

const TOWER_ART = {
  arrow: { accent: '#7ec96f', body: '#8a5f3c', roof: '#b5432e', kanji: '弓' },
  frost: { accent: '#89d0e8', body: '#f2ede2', roof: '#c73e2e', kanji: '札' },
  cannon: { accent: '#f0a05a', body: '#4a4a55', roof: '#2e2e38', kanji: '砲' },
  sniper: { accent: '#c98fe8', body: '#3a3550', roof: '#57506e', kanji: '銃' },
};

export const ENEMY_STYLE = {
  normal: { icon: '👻', aura: '#bfe8f4' },
  fast: { icon: '👺', aura: '#f0b48f' },
  tank: { icon: '👹', aura: '#f08f8f' },
  regen: { icon: '🦝', aura: '#d4b48f' },
  shield: { icon: '💀', aura: '#c4cdd8' },
  boss: { icon: '🦊', aura: '#ffd76a' },
};

const THEME_DECO = { sakura: ['🌸', '🌸', '🌷'], bamboo: ['🎋', '🎍', '🌿'], castle: ['🏮', '🪨', '🍂'] };

// ---------------- 基本ヘルパー ----------------
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function vGrad(ctx, x, y, h, c0, c1) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  return g;
}

function outlinedText(ctx, text, x, y, font, fill, stroke = 'rgba(15,10,20,0.85)', lw = 3) {
  ctx.font = font;
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

// ---------------- エントリポイント ----------------
export function render(ctx, state, ui, t = 0) {
  ctx.clearRect(0, 0, WORLD.w, WORLD.h);

  if (state.status === 'title') {
    drawTitle(ctx, state, ui, t);
    return;
  }

  ctx.fillStyle = P.ink;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  drawField(ctx, state, t);
  drawGhost(ctx, state, ui, t);
  drawTowers(ctx, state, ui, t);
  drawEnemies(ctx, state, t);
  drawProjectiles(ctx, state);
  drawEffects(ctx, state);
  drawWaveBanner(ctx, state);
  drawHud(ctx, state, t);
  drawPanel(ctx, state, ui, t);

  if (state.status === 'paused') drawResultScreen(ctx, state, ui, t, 'pause');
  if (state.status === 'gameover') drawResultScreen(ctx, state, ui, t, 'lose');
  if (state.status === 'victory') drawResultScreen(ctx, state, ui, t, 'win');
}

// ---------------- タイトル ----------------
function drawTitle(ctx, state, ui, t) {
  // 夜空
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD.h);
  sky.addColorStop(0, P.night0);
  sky.addColorStop(0.55, P.night1);
  sky.addColorStop(1, P.night2);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  // 月
  const moonG = ctx.createRadialGradient(292, 74, 6, 292, 74, 60);
  moonG.addColorStop(0, 'rgba(255,244,214,0.95)');
  moonG.addColorStop(0.35, 'rgba(255,240,200,0.5)');
  moonG.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = moonG;
  ctx.fillRect(222, 4, 140, 140);
  ctx.fillStyle = '#fbf2d2';
  ctx.beginPath();
  ctx.arc(292, 74, 24, 0, Math.PI * 2);
  ctx.fill();

  // 遠山のシルエット
  ctx.fillStyle = 'rgba(20,16,40,0.85)';
  ctx.beginPath();
  ctx.moveTo(0, 220);
  ctx.quadraticCurveTo(70, 150, 150, 208);
  ctx.quadraticCurveTo(230, 150, 300, 205);
  ctx.quadraticCurveTo(340, 180, 360, 196);
  ctx.lineTo(360, 260);
  ctx.lineTo(0, 260);
  ctx.closePath();
  ctx.fill();

  // 城のシルエット＋光
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = 'rgba(242,212,137,0.8)';
  ctx.shadowBlur = 26;
  ctx.font = '66px serif';
  ctx.fillText('🏯', WORLD.w / 2, 122);
  ctx.restore();

  // ロゴ
  outlinedText(ctx, '城まもり！', WORLD.w / 2, 178, `bold 42px ${SERIF}`, P.cream, 'rgba(10,6,16,0.9)', 6);
  ctx.fillStyle = P.gold;
  ctx.font = `13px ${SERIF}`;
  ctx.fillText('〜 和風タワーディフェンス 〜', WORLD.w / 2, 202);

  // 朱印
  ctx.save();
  ctx.translate(320, 168);
  ctx.rotate(0.12);
  ctx.fillStyle = P.vermil;
  rr(ctx, -15, -15, 30, 30, 4);
  ctx.fill();
  ctx.fillStyle = P.cream;
  ctx.font = `bold 19px ${SERIF}`;
  ctx.fillText('守', 0, 7);
  ctx.restore();

  ctx.fillStyle = P.dim;
  ctx.font = `12px ${SANS}`;
  ctx.fillText('侍と巫女で妖怪の大軍勢からお城を守れ', WORLD.w / 2, 228);

  // マップカード
  for (const b of getButtons(state, ui)) drawMapCard(ctx, b);

  // 舞い散る桜（決定的アニメ）
  for (let i = 0; i < 16; i++) {
    const speed = 22 + (i % 5) * 7;
    const px = (((i * 73) % 380) + Math.sin(t * 0.7 + i * 1.7) * 34 + t * 12) % 396 - 18;
    const py = ((i * 61) + t * speed) % (WORLD.h + 40) - 20;
    const rot = t * (0.8 + (i % 3) * 0.5) + i;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.fillStyle = i % 4 === 0 ? 'rgba(255,214,228,0.85)' : 'rgba(248,183,206,0.75)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = P.dim;
  ctx.textAlign = 'center';
  ctx.font = `11px ${SANS}`;
  ctx.globalAlpha = 0.75 + Math.sin(t * 2.4) * 0.25;
  ctx.fillText('― タップでマップを選択 ―', WORLD.w / 2, 618);
  ctx.globalAlpha = 1;
}

function drawMapCard(ctx, b) {
  const i = Number(b.id.slice(4));
  const map = MAPS[i];

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = b.enabled ? vGrad(ctx, b.x, b.y, b.h, '#2b2138', '#1c1626') : '#1a1520';
  rr(ctx, b.x, b.y, b.w, b.h, 12);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = b.enabled ? P.gold : '#3a3244';
  ctx.lineWidth = 1.5;
  rr(ctx, b.x, b.y, b.w, b.h, 12);
  ctx.stroke();

  if (!b.enabled) {
    ctx.textAlign = 'center';
    ctx.font = '26px serif';
    ctx.globalAlpha = 0.85;
    ctx.fillText('🔒', b.x + 44, b.y + b.h / 2 + 9);
    ctx.globalAlpha = 1;
    ctx.fillStyle = P.dim;
    ctx.font = `bold 15px ${SERIF}`;
    ctx.textAlign = 'left';
    ctx.fillText('？？？', b.x + 86, b.y + 38);
    ctx.font = `11px ${SANS}`;
    ctx.fillText(b.sub, b.x + 86, b.y + 60);
    return;
  }

  // 道のミニプレビュー
  const pv = { x: b.x + 12, y: b.y + 14, w: 64, h: 64 };
  ctx.fillStyle = P.grassDark;
  rr(ctx, pv.x, pv.y, pv.w, pv.h, 6);
  ctx.fill();
  ctx.save();
  rr(ctx, pv.x, pv.y, pv.w, pv.h, 6);
  ctx.clip();
  ctx.strokeStyle = P.path;
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  map.waypoints.forEach(([c, r], k) => {
    const px = pv.x + ((c + 0.5) / GRID.cols) * pv.w;
    const py = pv.y + ((r + 0.5) / GRID.rows) * pv.h;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(217,180,95,0.5)';
  ctx.lineWidth = 1;
  rr(ctx, pv.x, pv.y, pv.w, pv.h, 6);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = P.cream;
  ctx.font = `bold 17px ${SERIF}`;
  ctx.fillText(`${['一', '二', '三'][i]}の陣  ${map.name}`, b.x + 88, b.y + 34);
  ctx.fillStyle = P.dim;
  ctx.font = `10.5px ${SANS}`;
  wrapText(ctx, map.desc, b.x + 88, b.y + 54, b.w - 100, 15);

  if (b.cleared) {
    ctx.textAlign = 'right';
    ctx.font = '17px serif';
    ctx.fillText('⭐', b.x + b.w - 10, b.y + 24);
  }
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  let line = '';
  let yy = y;
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW) {
      ctx.fillText(line, x, yy);
      line = ch;
      yy += lineH;
    } else {
      line += ch;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

// ---------------- フィールド ----------------
function drawField(ctx, state, t) {
  const fieldY = GRID.top;
  const fieldH = GRID.rows * GRID.cell;

  // 芝生ベース
  ctx.fillStyle = vGrad(ctx, 0, fieldY, fieldH, P.grass, P.grassDeep);
  ctx.fillRect(0, fieldY, WORLD.w, fieldH);

  // 市松の淡い変化と草むら
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      const x = c * GRID.cell;
      const y = fieldY + r * GRID.cell;
      if ((c + r) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.035)';
        ctx.fillRect(x, y, GRID.cell, GRID.cell);
      }
      const h = (c * 31 + r * 17) % 13;
      if (h === 0 && !state.path.cells.has(`${c},${r}`)) {
        ctx.strokeStyle = 'rgba(30,60,25,0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x + 12, y + 30);
        ctx.lineTo(x + 14, y + 24);
        ctx.moveTo(x + 16, y + 30);
        ctx.lineTo(x + 16, y + 23);
        ctx.moveTo(x + 20, y + 30);
        ctx.lineTo(x + 18, y + 24);
        ctx.stroke();
      }
    }
  }

  // 道（角丸の太いポリライン＋飛び石）
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = P.pathEdge;
  ctx.lineWidth = 32;
  pathStroke(ctx, state.path.points);
  ctx.strokeStyle = P.path;
  ctx.lineWidth = 26;
  pathStroke(ctx, state.path.points);
  ctx.strokeStyle = 'rgba(255,240,210,0.18)';
  ctx.lineWidth = 12;
  pathStroke(ctx, state.path.points);

  // 飛び石
  ctx.fillStyle = 'rgba(120,88,50,0.28)';
  for (let d = 18; d < state.path.total; d += 34) {
    const pos = pathPointAt(state.path, d);
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y, 5.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // テーマ飾り（決定的配置・影付き）
  const decos = THEME_DECO[MAPS[state.mapIndex].theme] || THEME_DECO.sakura;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      if (state.path.cells.has(`${c},${r}`)) continue;
      const h = (c * 7 + r * 13) % 11;
      if (h !== 0) continue;
      const { x, y } = cellCenter(c, r);
      const deco = decos[(c + r) % decos.length];
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(x + 9, y - 3, 7, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '15px serif';
      ctx.globalAlpha = 0.9;
      ctx.fillText(deco, x + 9, y - 10);
      ctx.globalAlpha = 1;
    }
  }

  // 入口の鳥居（ベクター描画）
  const start = state.path.points[0];
  drawTorii(ctx, start.x, start.y, t);

  // 出口のお城＋守護オーラ
  const goal = state.path.points[state.path.points.length - 1];
  ctx.strokeStyle = `rgba(242,212,137,${0.2 + Math.sin(t * 3) * 0.08})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(goal.x, goal.y - 2, 18 + Math.sin(t * 3) * 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(goal.x, goal.y + 12, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '28px serif';
  ctx.fillText('🏯', goal.x, goal.y - 2);
  ctx.textBaseline = 'alphabetic';
}

function pathStroke(ctx, points) {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
}

// pointAt と同等だが renderer 内専用（engine の pointAt は state 用なので独立させる）
function pathPointAt(path, dist) {
  for (const seg of path.segs) {
    if (dist < seg.start + seg.len) {
      const k = (dist - seg.start) / seg.len;
      return { x: seg.a.x + (seg.b.x - seg.a.x) * k, y: seg.a.y + (seg.b.y - seg.a.y) * k };
    }
  }
  return path.points[path.points.length - 1];
}

function drawTorii(ctx, x, y, t) {
  ctx.save();
  ctx.translate(x, y + 6);
  // 支柱
  ctx.fillStyle = P.vermilDeep;
  ctx.fillRect(-11, -14, 4, 20);
  ctx.fillRect(7, -14, 4, 20);
  ctx.fillStyle = P.vermil;
  ctx.fillRect(-12, -15, 4, 20);
  ctx.fillRect(8, -15, 4, 20);
  // 笠木（上の反り）
  ctx.fillStyle = P.vermil;
  ctx.beginPath();
  ctx.moveTo(-17, -19);
  ctx.quadraticCurveTo(0, -24, 17, -19);
  ctx.lineTo(17, -15.5);
  ctx.quadraticCurveTo(0, -20, -17, -15.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2a1a14';
  ctx.beginPath();
  ctx.moveTo(-17, -20.5);
  ctx.quadraticCurveTo(0, -25.5, 17, -20.5);
  ctx.lineTo(17, -19);
  ctx.quadraticCurveTo(0, -24, -17, -19);
  ctx.closePath();
  ctx.fill();
  // 貫
  ctx.fillStyle = P.vermil;
  ctx.fillRect(-13, -10, 26, 3);
  // ゆらめく妖気
  ctx.globalAlpha = 0.3 + Math.sin(t * 2.2) * 0.12;
  const g = ctx.createRadialGradient(0, -6, 2, 0, -6, 22);
  g.addColorStop(0, 'rgba(150,90,220,0.8)');
  g.addColorStop(1, 'rgba(150,90,220,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-22, -28, 44, 40);
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------------- 建設ゴースト ----------------
function drawGhost(ctx, state, ui, t) {
  if (state.status !== 'playing' || !ui.buildType || !ui.hoverCell) return;
  const { c, r } = ui.hoverCell;
  const ok = canBuildAt(state, c, r) && state.gold >= TOWER_TYPES[ui.buildType].cost;
  const { x, y } = cellCenter(c, r);
  const range = TOWER_TYPES[ui.buildType].levels[0].range;
  const col = ok ? '143,212,160' : '255,106,122';

  ctx.fillStyle = `rgba(${col},0.16)`;
  ctx.beginPath();
  ctx.arc(x, y, range, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${col},0.8)`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = -t * 16;
  ctx.beginPath();
  ctx.arc(x, y, range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.75;
  drawTowerArt(ctx, ui.buildType, x, y, 1, 1, 0);
  ctx.globalAlpha = 1;
}

// ---------------- タワー ----------------
function drawTowers(ctx, state, ui, t) {
  for (const tw of state.towers) {
    const stats = towerStats(tw);

    if (ui.selectedTowerId === tw.id) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.arc(tw.x, tw.y, stats.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = P.goldHi;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -t * 20;
      ctx.beginPath();
      ctx.arc(tw.x, tw.y, stats.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 発射直後のリコイル
    const sinceShot = stats.cd - tw.cd;
    const recoil = sinceShot >= 0 && sinceShot < 0.14 ? 1.1 - sinceShot * 0.7 : 1;
    drawTowerArt(ctx, tw.type, tw.x, tw.y, recoil, tw.level, t);
  }
}

// タワー1基のアート。scale はリコイル用。
function drawTowerArt(ctx, type, x, y, scale, level, t) {
  const art = TOWER_ART[type];
  ctx.save();
  ctx.translate(x, y + 8);
  ctx.scale(scale, scale);

  // 影と石の台座
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 6, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = vGrad(ctx, -13, -2, 9, '#a49a8c', '#7c7264');
  rr(ctx, -13, -2, 26, 9, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,34,28,0.5)';
  ctx.lineWidth = 1;
  rr(ctx, -13, -2, 26, 9, 3);
  ctx.stroke();

  // 本体（タイプ別）
  if (type === 'arrow') {
    ctx.fillStyle = vGrad(ctx, -9, -22, 20, '#9a6f46', '#734d2e');
    ctx.beginPath();
    ctx.moveTo(-9, -2);
    ctx.lineTo(-6.5, -21);
    ctx.lineTo(6.5, -21);
    ctx.lineTo(9, -2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(50,32,18,0.6)';
    ctx.stroke();
    // 屋根
    ctx.fillStyle = art.roof;
    ctx.beginPath();
    ctx.moveTo(-12, -20);
    ctx.quadraticCurveTo(0, -30, 12, -20);
    ctx.lineTo(9, -17);
    ctx.quadraticCurveTo(0, -25, -9, -17);
    ctx.closePath();
    ctx.fill();
  } else if (type === 'frost') {
    ctx.fillStyle = vGrad(ctx, -8, -20, 18, '#fbf6ea', '#ded4c0');
    rr(ctx, -8, -20, 16, 18, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,70,60,0.4)';
    rr(ctx, -8, -20, 16, 18, 2);
    ctx.stroke();
    // 朱の屋根（神社風）
    ctx.fillStyle = art.roof;
    ctx.beginPath();
    ctx.moveTo(-13, -19);
    ctx.quadraticCurveTo(0, -27, 13, -19);
    ctx.lineTo(13, -16.5);
    ctx.quadraticCurveTo(0, -24, -13, -16.5);
    ctx.closePath();
    ctx.fill();
    // 揺れるお札
    ctx.save();
    ctx.translate(0, -13);
    ctx.rotate(Math.sin(t * 3) * 0.15);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-2.5, 0, 5, 9);
    ctx.strokeStyle = '#c73e2e';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-2.5, 0, 5, 9);
    ctx.restore();
  } else if (type === 'cannon') {
    ctx.fillStyle = vGrad(ctx, -10, -14, 13, '#5b5b68', '#3c3c46');
    rr(ctx, -10, -14, 20, 13, 4);
    ctx.fill();
    // 砲身
    ctx.fillStyle = vGrad(ctx, -6, -26, 14, '#4e4e5a', '#2c2c34');
    rr(ctx, -6, -26, 12, 15, 3);
    ctx.fill();
    ctx.fillStyle = P.gold;
    ctx.fillRect(-6.5, -18, 13, 2.2);
    ctx.fillStyle = '#1c1c22';
    ctx.beginPath();
    ctx.ellipse(0, -25, 5, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // sniper: 高楼
    ctx.fillStyle = vGrad(ctx, -7, -27, 25, '#4a4364', '#332e48');
    ctx.beginPath();
    ctx.moveTo(-7, -2);
    ctx.lineTo(-5, -26);
    ctx.lineTo(5, -26);
    ctx.lineTo(7, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = art.roof;
    ctx.beginPath();
    ctx.moveTo(-9, -25);
    ctx.quadraticCurveTo(0, -32, 9, -25);
    ctx.lineTo(6, -23);
    ctx.quadraticCurveTo(0, -28, -6, -23);
    ctx.closePath();
    ctx.fill();
    // 銃眼の光
    ctx.fillStyle = `rgba(242,212,137,${0.6 + Math.sin(t * 5) * 0.4})`;
    ctx.fillRect(-2.6, -20, 5.2, 2.4);
  }

  // 紋章（漢字）
  ctx.beginPath();
  ctx.arc(0, -7, 6.6, 0, Math.PI * 2);
  ctx.fillStyle = P.cream;
  ctx.fill();
  ctx.strokeStyle = art.accent;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#3a2020';
  ctx.font = `bold 8.5px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(art.kanji, 0, -6.6);
  ctx.textBaseline = 'alphabetic';

  // レベル星
  if (level > 1) {
    ctx.fillStyle = P.goldHi;
    ctx.font = '7px sans-serif';
    const stars = '★'.repeat(level - 1);
    ctx.strokeStyle = 'rgba(20,12,4,0.8)';
    ctx.lineWidth = 2;
    ctx.strokeText(stars, 0, 12);
    ctx.fillText(stars, 0, 12);
  }
  ctx.restore();
}

// ---------------- 敵 ----------------
function drawEnemies(ctx, state, t) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const e of state.enemies) {
    const style = ENEMY_STYLE[e.type];
    const slowed = e.slowTimer > 0;
    const bob = Math.sin(t * 7 + e.id * 1.3) * 1.8;

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.radius * 0.85, e.radius * 0.8, e.radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // オーラ
    ctx.globalAlpha = e.type === 'boss' ? 0.4 + Math.sin(t * 4) * 0.15 : 0.25;
    ctx.fillStyle = slowed ? '#8fc4e8' : style.aura;
    ctx.beginPath();
    ctx.arc(e.x, e.y + bob * 0.4, e.radius + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 本体
    ctx.font = `${Math.round(e.radius * 2.15)}px serif`;
    ctx.fillText(style.icon, e.x, e.y + bob);

    if (slowed) {
      ctx.strokeStyle = 'rgba(159,220,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(e.x, e.y + bob, e.radius + 5, t * 2, t * 2 + Math.PI * 1.6);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (e.type === 'shield') {
      ctx.strokeStyle = 'rgba(220,232,244,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y + bob, e.radius + 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.type === 'boss') {
      ctx.font = '13px serif';
      ctx.fillText('👑', e.x, e.y + bob - e.radius - 16);
    }

    // HPバー
    const w = e.radius * 2 + 4;
    const hy = e.y - e.radius - 9 + bob * 0.3;
    const ratio = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(10,8,14,0.7)';
    rr(ctx, e.x - w / 2 - 1, hy - 1, w + 2, 5.5, 2.5);
    ctx.fill();
    ctx.fillStyle = ratio > 0.5 ? P.good : ratio > 0.25 ? '#ffd76a' : P.danger;
    if (ratio > 0) {
      rr(ctx, e.x - w / 2, hy, Math.max(2, w * ratio), 3.5, 1.75);
      ctx.fill();
    }
  }
  ctx.textBaseline = 'alphabetic';
}

// ---------------- 弾 ----------------
function drawProjectiles(ctx, state) {
  for (const p of state.projectiles) {
    const ang = Math.atan2(p.ty - p.y, p.tx - p.x);
    if (p.type === 'arrow') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      ctx.strokeStyle = '#6e4a28';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      ctx.fillStyle = P.cream;
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(2, -2.4);
      ctx.lineTo(2, 2.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (p.type === 'frost') {
      const g = ctx.createRadialGradient(p.x, p.y, 0.5, p.x, p.y, 7);
      g.addColorStop(0, 'rgba(235,250,255,0.95)');
      g.addColorStop(0.5, 'rgba(137,208,232,0.8)');
      g.addColorStop(1, 'rgba(137,208,232,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // cannon: 砲弾＋尾
      ctx.strokeStyle = 'rgba(240,160,90,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(ang) * 10, p.y - Math.sin(ang) * 10);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.fillStyle = '#2c2c34';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(p.x - 1.5, p.y - 1.5, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------------- エフェクト ----------------
function drawEffects(ctx, state) {
  for (const fx of state.effects) {
    const k = fx.max ? Math.max(0, fx.ttl / fx.max) : 1;
    if (fx.kind === 'boom') {
      const rad = fx.r * (1.25 - k * 0.55);
      ctx.globalAlpha = k * 0.75;
      let g = ctx.createRadialGradient(fx.x, fx.y, 1, fx.x, fx.y, rad);
      g.addColorStop(0, 'rgba(255,236,170,0.95)');
      g.addColorStop(0.4, 'rgba(255,160,80,0.8)');
      g.addColorStop(1, 'rgba(120,60,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = k * 0.5;
      ctx.strokeStyle = '#f5eeda';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r * (1.35 - k * 0.35), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'pop') {
      ctx.globalAlpha = k;
      ctx.strokeStyle = fx.color || '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.r * (1.5 - k * 0.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'spark') {
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#fff2c8';
      ctx.lineWidth = 1.6;
      const n = 5;
      const len = 3 + (1 - k) * 6;
      for (let i = 0; i < n; i++) {
        const a = (fx.seed % 7) + (i / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(fx.x + Math.cos(a) * 2, fx.y + Math.sin(a) * 2);
        ctx.lineTo(fx.x + Math.cos(a) * (2 + len), fx.y + Math.sin(a) * (2 + len));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'beam') {
      ctx.globalAlpha = k * 0.5;
      ctx.strokeStyle = '#c98fe8';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
      ctx.stroke();
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#f7ecff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'text') {
      ctx.globalAlpha = Math.min(1, fx.ttl * 2.5);
      ctx.textAlign = 'center';
      outlinedText(ctx, fx.text, fx.x, fx.y, `bold 13px ${SANS}`, fx.color || P.cream);
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'dmg') {
      ctx.globalAlpha = Math.min(1, fx.ttl * 3) * 0.9;
      ctx.textAlign = 'center';
      outlinedText(ctx, fx.text, fx.x, fx.y - (1 - k) * 10, `bold 10px ${SANS}`, '#ffffff', 'rgba(20,10,20,0.8)', 2.5);
      ctx.globalAlpha = 1;
    }
  }
}

// ---------------- ウェーブ襲来バナー ----------------
function drawWaveBanner(ctx, state) {
  const b = state.waveBanner;
  if (!b || state.status !== 'playing') return;
  const k = b.ttl / b.max; // 1 → 0
  const appear = Math.min(1, (1 - k) * 6); // 出現アニメ
  const fade = Math.min(1, k * 4); // 消えるアニメ
  const alpha = Math.min(appear, fade);

  const y = 268;
  ctx.globalAlpha = alpha * 0.72;
  ctx.fillStyle = '#0d0912';
  ctx.fillRect(0, y, WORLD.w, 56);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = P.gold;
  ctx.fillRect(0, y, WORLD.w, 1.5);
  ctx.fillRect(0, y + 54.5, WORLD.w, 1.5);

  const slide = (1 - appear) * 30;
  ctx.textAlign = 'center';
  const label = b.boss ? `第${jpNum(b.wave)}波 — 大妖、現る！` : `第${jpNum(b.wave)}波 来襲！`;
  outlinedText(ctx, label, WORLD.w / 2 + slide, y + 36, `bold 21px ${SERIF}`, b.boss ? '#ffb0a0' : P.cream, 'rgba(0,0,0,0.9)', 4);
  ctx.globalAlpha = 1;
}

function jpNum(n) {
  const d = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (n <= 10) return n === 10 ? '十' : d[n];
  if (n < 20) return `十${d[n - 10]}`;
  return n === 20 ? '二十' : `二十${d[n - 20]}`;
}

// ---------------- HUD ----------------
function drawHud(ctx, state, t) {
  ctx.fillStyle = vGrad(ctx, 0, 0, GRID.top, '#241b2e', '#1a1322');
  ctx.fillRect(0, 0, WORLD.w, GRID.top);
  ctx.fillStyle = P.gold;
  ctx.fillRect(0, GRID.top - 1.5, WORLD.w, 1.5);

  const chip = (x, w) => {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    rr(ctx, x, 10, w, 27, 13);
    ctx.fill();
  };

  // 城の耐久
  chip(8, 74);
  const panic = state.lives <= 3;
  ctx.textAlign = 'left';
  ctx.font = `14px serif`;
  ctx.save();
  if (panic) {
    ctx.translate(24, 24);
    ctx.scale(1 + Math.sin(t * 8) * 0.12, 1 + Math.sin(t * 8) * 0.12);
    ctx.translate(-24, -24);
  }
  ctx.fillText('❤️', 16, 29);
  ctx.restore();
  ctx.fillStyle = panic ? P.danger : P.cream;
  ctx.font = `bold 15px ${SANS}`;
  ctx.fillText(String(state.lives), 42, 29);

  // 小判
  chip(88, 88);
  ctx.font = '14px serif';
  ctx.fillText('💰', 96, 29);
  ctx.fillStyle = P.goldHi;
  ctx.font = `bold 15px ${SANS}`;
  ctx.fillText(String(state.gold), 122, 29);

  // ウェーブ
  chip(182, 92);
  ctx.fillStyle = P.cream;
  ctx.font = `bold 13px ${SERIF}`;
  ctx.fillText(`波 ${state.wave}/${state.totalWaves}`, 192, 28);
  // 進行ミニバー
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  rr(ctx, 192, 31.5, 72, 3, 1.5);
  ctx.fill();
  ctx.fillStyle = P.gold;
  const prog = state.wave / state.totalWaves;
  if (prog > 0) {
    rr(ctx, 192, 31.5, Math.max(2, 72 * prog), 3, 1.5);
    ctx.fill();
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = P.dim;
  ctx.font = `10px ${SANS}`;
  ctx.fillText('SCORE', WORLD.w - 8, 19);
  ctx.fillStyle = P.cream;
  ctx.font = `bold 13px ${SANS}`;
  ctx.fillText(String(state.score), WORLD.w - 8, 34);
}

// ---------------- 下部パネル ----------------
function drawPanel(ctx, state, ui, t) {
  ctx.fillStyle = vGrad(ctx, 0, PANEL_Y, WORLD.h - PANEL_Y, '#241b2e', '#160f1e');
  ctx.fillRect(0, PANEL_Y, WORLD.w, WORLD.h - PANEL_Y);
  ctx.fillStyle = P.gold;
  ctx.fillRect(0, PANEL_Y, WORLD.w, 1.5);

  const selected = ui.selectedTowerId != null
    ? state.towers.find((tw) => tw.id === ui.selectedTowerId)
    : null;

  // 情報ストリップ
  ctx.textAlign = 'center';
  if (selected) {
    const def = TOWER_TYPES[selected.type];
    const stats = towerStats(selected);
    const next = selected.level < 3 ? def.levels[selected.level] : null;
    ctx.font = `11px ${SANS}`;
    ctx.fillStyle = P.cream;
    const nextTxt = next ? `  ⇒ 攻${next.dmg}・射${next.range}` : '（最大強化済み）';
    strip(ctx, `${def.name} Lv${selected.level}  攻${stats.dmg}・射${stats.range}・撃破${selected.kills}${nextTxt}`);
  } else if (ui.buildType) {
    strip(ctx, `${TOWER_TYPES[ui.buildType].desc} — 置きたいマスをタップ`);
  } else if (!state.waveActive && state.wave < state.totalWaves) {
    const next = makeWave(state.mapIndex, state.wave + 1);
    const counts = {};
    for (const e of next.entries) counts[e.type] = (counts[e.type] || 0) + 1;
    const preview = Object.entries(counts).map(([type, n]) => `${ENEMY_STYLE[type].icon}×${n}`).join(' ');
    strip(ctx, `次の襲来 ${preview}`);
  }

  for (const b of getButtons(state, ui)) {
    if (b.id.startsWith('build-')) drawBuildButton(ctx, b, t);
    else drawUiButton(ctx, b, t);
  }
}

function strip(ctx, text) {
  ctx.save();
  ctx.fillStyle = 'rgba(13,9,18,0.72)';
  const w = ctx.measureText(text).width + 24;
  rr(ctx, WORLD.w / 2 - w / 2, PANEL_Y - 20, w, 17, 8.5);
  ctx.fill();
  ctx.fillStyle = P.cream;
  ctx.font = `11px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.fillText(text, WORLD.w / 2, PANEL_Y - 7.5);
  ctx.restore();
}

function drawBuildButton(ctx, b, t) {
  ctx.save();
  if (b.active) {
    ctx.shadowColor = 'rgba(242,212,137,0.65)';
    ctx.shadowBlur = 10;
  }
  ctx.fillStyle = !b.enabled
    ? '#211a2a'
    : b.active
      ? vGrad(ctx, b.x, b.y, b.h, '#4b3a2a', '#332618')
      : vGrad(ctx, b.x, b.y, b.h, '#322842', '#241c30');
  rr(ctx, b.x, b.y, b.w, b.h, 9);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = b.active ? P.goldHi : b.enabled ? 'rgba(217,180,95,0.4)' : '#312a3c';
  ctx.lineWidth = b.active ? 2 : 1;
  rr(ctx, b.x, b.y, b.w, b.h, 9);
  ctx.stroke();

  // ミニタワーアート
  ctx.save();
  if (!b.enabled) ctx.globalAlpha = 0.4;
  ctx.translate(b.x + 20, b.y + 30);
  ctx.scale(0.72, 0.72);
  drawTowerArt(ctx, b.towerType, 0, -6, 1, 1, t);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = b.enabled ? P.cream : P.dim;
  ctx.font = `bold 12px ${SERIF}`;
  ctx.fillText(b.label, b.x + 36, b.y + 22);
  // コストの小判チップ
  ctx.fillStyle = b.enabled ? 'rgba(217,180,95,0.18)' : 'rgba(255,255,255,0.05)';
  rr(ctx, b.x + 35, b.y + 29, b.w - 42, 15, 7);
  ctx.fill();
  ctx.fillStyle = b.enabled ? P.goldHi : P.dim;
  ctx.font = `bold 10.5px ${SANS}`;
  ctx.fillText(b.sub, b.x + 42, b.y + 40);
}

function drawUiButton(ctx, b, t) {
  const primary = b.id === 'wave-start' || b.id === 'retry' || b.id === 'resume' || (b.id === 'upgrade' && b.enabled);
  ctx.save();
  if (primary && b.enabled) {
    ctx.shadowColor = 'rgba(199,62,46,0.55)';
    ctx.shadowBlur = 9 + Math.sin(t * 3.5) * 3;
  }
  ctx.fillStyle = !b.enabled
    ? '#241d2e'
    : primary
      ? vGrad(ctx, b.x, b.y, b.h, P.vermilHi, P.vermilDeep)
      : vGrad(ctx, b.x, b.y, b.h, '#38304a', '#272033');
  rr(ctx, b.x, b.y, b.w, b.h, 9);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = !b.enabled ? '#332c3e' : primary ? '#f2a08a' : 'rgba(217,180,95,0.45)';
  ctx.lineWidth = 1.2;
  rr(ctx, b.x, b.y, b.w, b.h, 9);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = b.enabled ? P.cream : '#6e6280';
  ctx.font = `bold 13px ${SANS}`;
  ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 4.5);
}

// ---------------- リザルト / ポーズ ----------------
function drawResultScreen(ctx, state, ui, t, mode) {
  // 暗幕（周辺減光）
  const vg = ctx.createRadialGradient(WORLD.w / 2, 300, 60, WORLD.w / 2, 300, 460);
  vg.addColorStop(0, 'rgba(10,6,14,0.72)');
  vg.addColorStop(1, 'rgba(6,3,10,0.9)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  ctx.textAlign = 'center';

  if (mode === 'pause') {
    outlinedText(ctx, '休 戦', WORLD.w / 2, 240, `bold 34px ${SERIF}`, P.cream);
    ctx.fillStyle = P.dim;
    ctx.font = `12px ${SANS}`;
    ctx.fillText('ひと息ついて、次の一手を。', WORLD.w / 2, 268);
  } else if (mode === 'win') {
    // 勝利：金の紋と三ツ星
    ctx.save();
    ctx.shadowColor = 'rgba(242,212,137,0.75)';
    ctx.shadowBlur = 22;
    outlinedText(ctx, '討伐成功', WORLD.w / 2, 226, `bold 40px ${SERIF}`, P.goldHi, 'rgba(30,16,4,0.9)', 6);
    ctx.restore();

    const stars = state.lives >= 8 ? 3 : state.lives >= 4 ? 2 : 1;
    for (let i = 0; i < 3; i++) {
      const on = i < stars;
      const pop = Math.min(1, Math.max(0, t * 2 - i * 0.35)) || 1;
      ctx.font = `${Math.round(30 * (0.6 + 0.4 * pop))}px serif`;
      ctx.globalAlpha = on ? 1 : 0.25;
      ctx.fillText(on ? '⭐' : '☆', WORLD.w / 2 + (i - 1) * 46, 272);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = P.cream;
    ctx.font = `13px ${SANS}`;
    ctx.fillText(`${MAPS[state.mapIndex].name} を妖怪から守りきった！`, WORLD.w / 2, 308);
    ctx.fillStyle = P.goldHi;
    ctx.font = `bold 15px ${SANS}`;
    ctx.fillText(`SCORE ${state.score}　❤️ ${state.lives}`, WORLD.w / 2, 336);
  } else {
    outlinedText(ctx, '落 城', WORLD.w / 2, 232, `bold 40px ${SERIF}`, P.danger, 'rgba(20,4,8,0.9)', 6);
    ctx.fillStyle = P.cream;
    ctx.font = `13px ${SANS}`;
    ctx.fillText(`第${jpNum(state.wave)}波で防衛線が破られた…`, WORLD.w / 2, 300);
    ctx.fillStyle = P.goldHi;
    ctx.font = `bold 15px ${SANS}`;
    ctx.fillText(`SCORE ${state.score}`, WORLD.w / 2, 330);
  }

  for (const b of getButtons(state, ui)) drawUiButton(ctx, b, t);
}
