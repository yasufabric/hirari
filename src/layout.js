// src/layout.js — ボタン配置の純粋ロジック。renderer（描画）と main（当たり判定）の両方から使う。
// DOM/Canvas には触らない。

import { MAPS, TOWER_TYPES, TOWER_ORDER, SELL_RATE, EARLY_CALL_RATE } from './engine.js';

export const PANEL_Y = 528; // 下部パネルの開始Y

// state と ui から、いま画面に出ているボタンの一覧を返す。
// ボタン: { id, x, y, w, h, label, sub?, enabled }
export function getButtons(state, ui) {
  const buttons = [];

  if (state.status === 'title') {
    MAPS.forEach((map, i) => {
      const locked = i >= ui.unlocked;
      const y = 250 + i * 108;
      buttons.push({
        id: `map-${i}`,
        x: 36, y, w: 288, h: 92,
        label: locked ? '🔒 ロック中' : `${i + 1}. ${map.name}`,
        sub: locked ? '前のマップをクリアで解放' : map.desc,
        enabled: !locked,
        cleared: !!ui.cleared[i],
      });
      if (ui.cleared[i]) {
        buttons.push({ id: `endless-${i}`, x: 226, y: y + 58, w: 90, h: 26, label: '∞ 果てなき戦', enabled: true });
      }
    });
    buttons.push(muteButton(ui, 304, 588));
    return buttons;
  }

  if (state.status === 'gameover' || state.status === 'victory') {
    buttons.push({ id: 'retry', x: 60, y: 408, w: 240, h: 56, label: 'もういちど', enabled: true });
    buttons.push({ id: 'to-title', x: 60, y: 478, w: 240, h: 56, label: 'マップせんたく', enabled: true });
    return buttons;
  }

  if (state.status === 'paused') {
    buttons.push({ id: 'resume', x: 60, y: 300, w: 240, h: 56, label: 'つづける', enabled: true });
    buttons.push({ id: 'to-title', x: 60, y: 370, w: 240, h: 56, label: 'マップせんたく', enabled: true });
    buttons.push(muteButton(ui, 148, 440));
    return buttons;
  }

  // status === 'playing'
  const selected = ui.selectedTowerId != null
    ? state.towers.find((t) => t.id === ui.selectedTowerId)
    : null;

  if (selected) {
    const def = TOWER_TYPES[selected.type];
    const upCost = selected.level < 3 ? def.upgradeCost[selected.level - 1] : null;
    buttons.push({
      id: 'upgrade', x: 4, y: PANEL_Y + 4, w: 150, h: 52,
      label: upCost != null ? `強化 ${upCost}G` : '最大レベル',
      enabled: upCost != null && state.gold >= upCost,
    });
    buttons.push({
      id: 'sell', x: 158, y: PANEL_Y + 4, w: 100, h: 52,
      label: `売却 ${Math.floor(selected.invested * SELL_RATE)}G`,
      enabled: true,
    });
    buttons.push({ id: 'close', x: 262, y: PANEL_Y + 4, w: 94, h: 52, label: '✕ とじる', enabled: true });
  } else {
    TOWER_ORDER.forEach((type, i) => {
      const def = TOWER_TYPES[type];
      buttons.push({
        id: `build-${type}`,
        x: 3 + i * 89, y: PANEL_Y + 4, w: 86, h: 52,
        label: def.name,
        sub: `${def.cost}G`,
        towerType: type,
        enabled: state.gold >= def.cost,
        active: ui.buildType === type,
      });
    });
  }

  const total = state.endless ? '∞' : state.totalWaves;
  const canCall = !state.waveActive && (state.endless || state.wave < state.totalWaves);
  const waveLabel = state.waveActive
    ? `WAVE ${state.wave}/${total} 進行中`
    : state.nextWaveTimer > 0
      ? `▶ 早呼び +${Math.ceil(state.nextWaveTimer * EARLY_CALL_RATE)}G`
      : canCall
        ? `▶ WAVE ${state.wave + 1} 開始`
        : 'クリアまであと少し';
  buttons.push({
    id: 'wave-start', x: 4, y: PANEL_Y + 62, w: 140, h: 46,
    label: waveLabel,
    enabled: canCall,
  });
  buttons.push({ id: 'speed', x: 148, y: PANEL_Y + 62, w: 64, h: 46, label: `⏩x${state.gameSpeed}`, enabled: true });
  buttons.push({ id: 'pause', x: 216, y: PANEL_Y + 62, w: 78, h: 46, label: '⏸ 休戦', enabled: true });
  buttons.push(muteButton(ui, 298, PANEL_Y + 62, 58, 46));
  return buttons;
}

function muteButton(ui, x, y, w = 52, h = 40) {
  return { id: 'mute', x, y, w, h, label: ui.muted ? '🔇' : '🔊', enabled: true };
}

export function hitButton(buttons, x, y) {
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}
