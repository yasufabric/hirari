// main.js — ゲームループ＋入力処理。engine と renderer を繋ぐ唯一の場所。
import { createGame, setPlayerTarget, startGame, update, WORLD } from './engine.js';
import { render } from './renderer.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let state = createGame(Date.now() >>> 0);

// テスト・デバッグ用に公開（smoke test が参照する）
window.__game = {
  get state() {
    return state;
  },
};

// ---- キャンバスのスケーリング（論理座標 360×640 固定） ----
let scale = 1;
let offsetX = 0;
let offsetY = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  scale = Math.min(vw / WORLD.width, vh / WORLD.height);
  const cssW = WORLD.width * scale;
  const cssH = WORLD.height * scale;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  const rect = canvas.getBoundingClientRect();
  offsetX = rect.left;
  offsetY = rect.top;
}
window.addEventListener('resize', resize);
resize();

// クライアント座標 → 論理座標
function toWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale,
  };
}

// ---- 入力（Pointer Events） ----
let dragging = false;

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  const p = toWorld(e.clientX, e.clientY);
  if (state.status === 'title') {
    startGame(state);
    return;
  }
  if (state.status === 'gameover') {
    state = createGame(Date.now() >>> 0);
    startGame(state);
    return;
  }
  if (state.status === 'playing') {
    dragging = true;
    setPlayerTarget(state, p.x, p.y);
  }
});

canvas.addEventListener('pointermove', (e) => {
  e.preventDefault();
  if (!dragging || state.status !== 'playing') return;
  const p = toWorld(e.clientX, e.clientY);
  setPlayerTarget(state, p.x, p.y);
});

canvas.addEventListener('pointerup', (e) => {
  e.preventDefault();
  dragging = false;
});

canvas.addEventListener('pointercancel', () => {
  dragging = false;
});

// ---- ゲームループ ----
let lastTime = performance.now();

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1); // タブ復帰時の暴走防止
  lastTime = now;
  update(state, dt);
  render(ctx, state);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
