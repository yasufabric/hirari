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

export const OBSTACLE_TYPES = ['star', 'heart', 'bubble'];
export const SPAWN_INTERVAL = 0.8; // 秒
export const OBSTACLE_SPEED_MIN = 120; // px/秒
export const OBSTACLE_SPEED_MAX = 220;
export const OBSTACLE_RADIUS_MIN = 10;
export const OBSTACLE_RADIUS_MAX = 16;

export const MAX_HP = 3;
export const STAGE_DURATION = 20; // 秒。生き残ればクリア
export const STAGE_CLEAR_BONUS = 100;
export const INVINCIBLE_DURATION = 1.0; // 被弾後の無敵秒数
export const HITBOX_FORGIVENESS = 0.8; // 見た目より当たり判定を少し甘くする

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
    obstacles: [],
    spawnTimer: SPAWN_INTERVAL,
    score: 0,
    hp: MAX_HP,
    maxHp: MAX_HP,
    invincibleTimer: 0,
    invincibleDuration: INVINCIBLE_DURATION,
    stage: 1,
    stageTime: 0,
    stageDuration: STAGE_DURATION,
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
  state.invincibleTimer = Math.max(0, state.invincibleTimer - dt);
  updatePlayer(state, dt);
  updateSpawner(state, dt);
  updateObstacles(state, dt);
  handleCollisions(state);
  updateStage(state, dt);
  return state;
}

function updateStage(state, dt) {
  if (state.status !== 'playing') return; // 直前の被弾でgameoverになっていたら進めない
  state.stageTime += dt;
  if (state.stageTime >= state.stageDuration) {
    state.score += STAGE_CLEAR_BONUS;
    state.status = 'stageClear';
  }
}

// 次のステージを開始する（クリア画面から呼ぶ）
export function advanceStage(state) {
  state.stage += 1;
  state.stageTime = 0;
  state.obstacles = [];
  state.spawnTimer = SPAWN_INTERVAL;
  state.invincibleTimer = 0;
  state.status = 'playing';
  return state;
}

export function circlesHit(a, b, forgiveness = HITBOX_FORGIVENESS) {
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  return dist < (a.r + b.r) * forgiveness;
}

function handleCollisions(state) {
  if (state.invincibleTimer > 0) return;
  const p = state.player;
  const hitIndex = state.obstacles.findIndex((o) => circlesHit(p, o));
  if (hitIndex === -1) return;
  state.obstacles.splice(hitIndex, 1);
  state.hp -= 1;
  state.invincibleTimer = state.invincibleDuration;
  if (state.hp <= 0) {
    state.hp = 0;
    state.status = 'gameover';
  }
}

function updateSpawner(state, dt) {
  state.spawnTimer -= dt;
  while (state.spawnTimer <= 0) {
    spawnObstacle(state);
    state.spawnTimer += SPAWN_INTERVAL;
  }
}

export function spawnObstacle(state) {
  const rng = state.rng;
  const r =
    OBSTACLE_RADIUS_MIN + rng() * (OBSTACLE_RADIUS_MAX - OBSTACLE_RADIUS_MIN);
  const obstacle = {
    type: OBSTACLE_TYPES[Math.floor(rng() * OBSTACLE_TYPES.length)],
    x: r + rng() * (state.world.width - r * 2),
    y: -r,
    r,
    vy: OBSTACLE_SPEED_MIN + rng() * (OBSTACLE_SPEED_MAX - OBSTACLE_SPEED_MIN),
    spin: (rng() - 0.5) * 4, // 描画用の回転速度 rad/秒
    angle: 0,
  };
  state.obstacles.push(obstacle);
  return obstacle;
}

function updateObstacles(state, dt) {
  const bottom = state.world.height;
  for (const o of state.obstacles) {
    o.y += o.vy * dt;
    o.angle += o.spin * dt;
  }
  // 画面下に抜けたものは「避けた」としてスコア加算して除去
  const before = state.obstacles.length;
  state.obstacles = state.obstacles.filter((o) => o.y - o.r <= bottom);
  state.score += before - state.obstacles.length;
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
