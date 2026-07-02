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

export function createGame(seed = 1) {
  return {
    world: { ...WORLD },
    status: 'title', // 'title' | 'playing' | 'skillSelect' | 'gameover'
    rng: createRng(seed),
    time: 0,
  };
}

export function startGame(state) {
  state.status = 'playing';
  return state;
}

export function update(state, dt) {
  if (state.status !== 'playing') return state;
  state.time += dt;
  return state;
}
