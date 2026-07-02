// engine.js — 純粋ロジックのみ（DOM/Canvas/window 不使用）
// 乱数はシード付きRNG、時間は update(state, dt) の dt 経由で受け取る。

export const WORLD = { width: 360, height: 640 };

// 決定論的な乱数生成器（mulberry32）
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PLAYER_RADIUS = 16;
export const PLAYER_BASE_SPEED = 340; // px/秒

export function createGame(seed = 1) {
  const px = WORLD.width / 2;
  const py = WORLD.height * 0.8;
  return {
    world: { ...WORLD },
    status: 'title', // 'title' | 'playing' | 'skillSelect' | 'gameover'
    rng: createRng(seed),
    time: 0,
    player: {
      x: px,
      y: py,
      r: PLAYER_RADIUS,
      targetX: px,
      targetY: py,
      maxSpeed: PLAYER_BASE_SPEED,
    },
  };
}

export function startGame(state) {
  state.status = 'playing';
  return state;
}

// ドラッグ先（論理座標）を設定する。移動自体は update() が行う。
export function setPlayerTarget(state, x, y) {
  const p = state.player;
  p.targetX = clamp(x, p.r, state.world.width - p.r);
  p.targetY = clamp(y, p.r, state.world.height - p.r);
  return state;
}

export function update(state, dt) {
  if (state.status !== 'playing') return state;
  state.time += dt;
  updatePlayer(state, dt);
  return state;
}

function updatePlayer(state, dt) {
  const p = state.player;
  const dx = p.targetX - p.x;
  const dy = p.targetY - p.y;
  const dist = Math.hypot(dx, dy);
  const step = p.maxSpeed * dt;
  if (dist <= step) {
    p.x = p.targetX;
    p.y = p.targetY;
  } else {
    p.x += (dx / dist) * step;
    p.y += (dy / dist) * step;
  }
  p.x = clamp(p.x, p.r, state.world.width - p.r);
  p.y = clamp(p.y, p.r, state.world.height - p.r);
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}
