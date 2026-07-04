// src/main.js — ゲームループ（requestAnimationFrame）＋入力処理（Pointer Events）。
// engine と renderer を繋ぐ唯一の場所。localStorage への進捗保存もここ。

import {
  WORLD, MAPS, createState, update, startGame, toTitle, togglePause, cycleSpeed,
  placeTower, upgradeTower, sellTower, startNextWave, pointToCell,
} from './engine.js';
import { render } from './renderer.js';
import { getButtons, hitButton } from './layout.js';
import { initAudio, playSfx, setMuted, setMode } from './sfx.js';

const SAVE_KEY = 'mamori-td.progress.v1';
const MUTE_KEY = 'mamori-td.muted.v1';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const state = createState();
const ui = {
  buildType: null,
  selectedTowerId: null,
  hoverCell: null,
  cleared: loadProgress(),
  unlocked: 1,
  muted: loadMuted(),
  pressed: null, // { id, at } ボタン押下アニメ用
};
refreshUnlocked();
setMuted(ui.muted);

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

// ---------------- 進捗保存 ----------------
function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (Array.isArray(data?.cleared)) return MAPS.map((_, i) => !!data.cleared[i]);
  } catch { /* noop */ }
  return MAPS.map(() => false);
}

function saveProgress() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ cleared: ui.cleared }));
  } catch { /* noop */ }
}

function refreshUnlocked() {
  let n = 1;
  for (let i = 0; i < MAPS.length - 1 && ui.cleared[i]; i++) n = i + 2;
  ui.unlocked = n;
}

// ---------------- キャンバスのスケーリング ----------------
let scale = 1;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  scale = Math.min(window.innerWidth / WORLD.w, window.innerHeight / WORLD.h);
  canvas.width = Math.round(WORLD.w * scale * dpr);
  canvas.height = Math.round(WORLD.h * scale * dpr);
  canvas.style.width = `${WORLD.w * scale}px`;
  canvas.style.height = `${WORLD.h * scale}px`;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function viewToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
}

// CSSピクセル（canvas左上基準）に変換。スモークテストからも使う。
function worldToView(x, y) {
  return { x: x * scale, y: y * scale };
}

// ---------------- 入力 ----------------
canvas.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  initAudio();
  const pt = viewToWorld(ev.clientX, ev.clientY);
  handleTap(pt.x, pt.y);
});

canvas.addEventListener('pointermove', (ev) => {
  if (state.status !== 'playing' || !ui.buildType) return;
  const pt = viewToWorld(ev.clientX, ev.clientY);
  ui.hoverCell = pointToCell(pt.x, pt.y);
});

function handleTap(x, y) {
  const button = hitButton(getButtons(state, ui), x, y);
  if (button) {
    if (button.enabled) {
      ui.pressed = { id: button.id, at: performance.now() / 1000 };
      playSfx('tap');
    }
    onButton(button);
    return;
  }
  if (state.status !== 'playing') return;

  const cell = pointToCell(x, y);
  if (!cell) {
    ui.selectedTowerId = null;
    return;
  }

  const tower = state.towers.find((t) => t.c === cell.c && t.r === cell.r);
  if (tower) {
    ui.selectedTowerId = tower.id;
    ui.buildType = null;
    return;
  }
  if (ui.buildType) {
    ui.hoverCell = cell;
    placeTower(state, ui.buildType, cell.c, cell.r);
    return;
  }
  ui.selectedTowerId = null;
}

function onButton(b) {
  if (!b.enabled) return;
  const id = b.id;
  if (id.startsWith('map-')) {
    startRun(Number(id.slice(4)));
  } else if (id.startsWith('build-')) {
    ui.buildType = ui.buildType === b.towerType ? null : b.towerType;
    ui.selectedTowerId = null;
    ui.hoverCell = null;
  } else if (id === 'wave-start') {
    startNextWave(state);
  } else if (id === 'speed') {
    cycleSpeed(state);
  } else if (id === 'pause' || id === 'resume') {
    togglePause(state);
  } else if (id === 'upgrade') {
    upgradeTower(state, ui.selectedTowerId);
  } else if (id === 'sell') {
    sellTower(state, ui.selectedTowerId);
    ui.selectedTowerId = null;
  } else if (id === 'close') {
    ui.selectedTowerId = null;
  } else if (id === 'mute') {
    ui.muted = !ui.muted;
    setMuted(ui.muted);
    try {
      localStorage.setItem(MUTE_KEY, ui.muted ? '1' : '0');
    } catch { /* noop */ }
  } else if (id === 'retry') {
    startRun(state.mapIndex);
  } else if (id === 'to-title') {
    toTitle(state);
    resetUiSelection();
  }
}

function startRun(mapIndex) {
  startGame(state, mapIndex);
  resetUiSelection();
}

function resetUiSelection() {
  ui.buildType = null;
  ui.selectedTowerId = null;
  ui.hoverCell = null;
}

// ---------------- イベント（効果音・進捗） ----------------
function drainEvents() {
  for (const ev of state.events) {
    playSfx(ev);
    if (ev === 'victory') {
      ui.cleared[state.mapIndex] = true;
      saveProgress();
      refreshUnlocked();
    }
  }
  state.events.length = 0;
}

// ---------------- ゲームループ ----------------
let last = performance.now();

function bgmMode() {
  if (state.status === 'title') return 'title';
  if (state.status === 'playing') return state.waveActive ? 'battle' : 'calm';
  if (state.status === 'paused') return 'calm';
  return 'off';
}

function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  update(state, dt);
  drainEvents();
  setMode(bgmMode());
  render(ctx, state, ui, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// テスト・デバッグ用フック
window.__game = {
  state,
  ui,
  buttons: () => getButtons(state, ui),
  worldToView,
};
