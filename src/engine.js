// src/engine.js — 純粋ロジックのみ。DOM / Canvas / window / Date.now() / Math.random() は使わない。
// 時間は update(state, dt) の dt 経由で受け取る。座標は論理座標系 WORLD (360×640) 固定。

export const WORLD = { w: 360, h: 640 };
export const GRID = { cols: 9, rows: 12, cell: 40, top: 48 };
export const START_GOLD = 220;
export const START_LIVES = 10;
export const SELL_RATE = 0.6;

// ---------------- マップ ----------------
// waypoints はセル座標 [col, row]。必ず軸平行（縦横のみ）のセグメントで構成する。
export const MAPS = [
  {
    name: '桜の里',
    desc: '桜舞うのどかな里道。妖怪退治のはじまり。',
    theme: 'sakura',
    totalWaves: 20,
    waypoints: [[0, 1], [6, 1], [6, 4], [2, 4], [2, 8], [6, 8], [6, 10], [8, 10]],
  },
  {
    name: '竹林の隘路',
    desc: '長いつづら折りの竹林。妖怪も手ごわい。',
    theme: 'bamboo',
    totalWaves: 20,
    waypoints: [[4, 0], [4, 2], [1, 2], [1, 5], [7, 5], [7, 8], [1, 8], [1, 11], [8, 11]],
  },
  {
    name: '天守閣',
    desc: '本丸へ続くうずまき道。九尾の狐が攻めてくる。',
    theme: 'castle',
    totalWaves: 20,
    waypoints: [[0, 1], [7, 1], [7, 10], [1, 10], [1, 3], [5, 3], [5, 8], [3, 8], [3, 5]],
  },
];

// ---------------- 敵 ----------------
// 攻めてくる妖怪たち
export const ENEMY_TYPES = {
  normal: { name: 'おばけ', hp: 30, speed: 42, bounty: 6, armor: 0, regen: 0, livesCost: 1, radius: 10 },
  fast: { name: '烏天狗', hp: 18, speed: 80, bounty: 6, armor: 0, regen: 0, livesCost: 1, radius: 8 },
  tank: { name: '鬼', hp: 95, speed: 26, bounty: 12, armor: 1, regen: 0, livesCost: 2, radius: 13 },
  regen: { name: '化けだぬき', hp: 55, speed: 36, bounty: 10, armor: 0, regen: 5, livesCost: 1, radius: 11 },
  shield: { name: '落ち武者', hp: 70, speed: 34, bounty: 12, armor: 4, regen: 0, livesCost: 1, radius: 11 },
  boss: { name: '九尾の狐', hp: 950, speed: 18, bounty: 90, armor: 3, regen: 6, livesCost: 5, radius: 17, slowResist: true },
};

// ---------------- タワー ----------------
// 守り手（味方ユニット）
export const TOWER_TYPES = {
  arrow: {
    name: '弓侍', cost: 80, upgradeCost: [60, 90], projSpeed: 300,
    desc: '連射が速い頼れる弓の侍',
    levels: [
      { dmg: 8, range: 95, cd: 0.7 },
      { dmg: 14, range: 105, cd: 0.6 },
      { dmg: 24, range: 115, cd: 0.5 },
    ],
  },
  frost: {
    name: '巫女', cost: 100, upgradeCost: [70, 110], projSpeed: 240,
    desc: 'お札で妖怪を清めて鈍らせる',
    levels: [
      { dmg: 4, range: 85, cd: 1.1, slowMult: 0.55, slowTime: 1.6 },
      { dmg: 7, range: 95, cd: 1.0, slowMult: 0.45, slowTime: 2.0 },
      { dmg: 11, range: 105, cd: 0.9, slowMult: 0.35, slowTime: 2.4 },
    ],
  },
  cannon: {
    name: '大筒', cost: 140, upgradeCost: [100, 160], projSpeed: 200,
    desc: '爆発して周囲もまとめて攻撃',
    levels: [
      { dmg: 22, range: 90, cd: 1.7, splash: 46 },
      { dmg: 38, range: 100, cd: 1.5, splash: 54 },
      { dmg: 60, range: 110, cd: 1.3, splash: 62 },
    ],
  },
  sniper: {
    name: '火縄銃', cost: 180, upgradeCost: [130, 200], hitscan: true, pierce: true,
    desc: '超射程・鎧貫通の一撃',
    levels: [
      { dmg: 45, range: 165, cd: 2.4 },
      { dmg: 85, range: 185, cd: 2.2 },
      { dmg: 150, range: 205, cd: 2.0 },
    ],
  },
};

export const TOWER_ORDER = ['arrow', 'frost', 'cannon', 'sniper'];

export function towerStats(tower) {
  return TOWER_TYPES[tower.type].levels[tower.level - 1];
}

// ---------------- 座標・パス ----------------
export function cellCenter(c, r) {
  return { x: c * GRID.cell + GRID.cell / 2, y: GRID.top + r * GRID.cell + GRID.cell / 2 };
}

export function pointToCell(x, y) {
  const c = Math.floor(x / GRID.cell);
  const r = Math.floor((y - GRID.top) / GRID.cell);
  if (c < 0 || c >= GRID.cols || r < 0 || r >= GRID.rows) return null;
  return { c, r };
}

export function buildPath(waypoints) {
  const points = waypoints.map(([c, r]) => cellCenter(c, r));
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y); // 軸平行前提
    segs.push({ a, b, len, start: total });
    total += len;
  }
  const cells = new Set();
  for (let i = 0; i < waypoints.length - 1; i++) {
    let [c, r] = waypoints[i];
    const [c2, r2] = waypoints[i + 1];
    const dc = Math.sign(c2 - c);
    const dr = Math.sign(r2 - r);
    cells.add(`${c},${r}`);
    while (c !== c2 || r !== r2) {
      c += dc;
      r += dr;
      cells.add(`${c},${r}`);
    }
  }
  return { points, segs, total, cells };
}

export function pointAt(path, dist) {
  if (dist <= 0) return { ...path.points[0] };
  if (dist >= path.total) return { ...path.points[path.points.length - 1] };
  for (const seg of path.segs) {
    if (dist < seg.start + seg.len) {
      const t = (dist - seg.start) / seg.len;
      return { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
    }
  }
  return { ...path.points[path.points.length - 1] };
}

// ---------------- ウェーブ生成（決定的） ----------------
export function makeWave(mapIndex, wave) {
  const entries = [];
  const add = (type, n, gap) => {
    for (let i = 0; i < n; i++) entries.push({ type, gap });
  };
  if (wave % 10 === 0) {
    add('boss', wave / 10, 6);
    add('fast', 6, 0.7);
  } else if (wave <= 3) {
    add('normal', 5 + wave * 2, 1.1);
  } else if (wave <= 6) {
    add('normal', 6, 1.0);
    add('fast', wave, 0.6);
  } else if (wave <= 9) {
    add('tank', wave - 4, 1.6);
    add('normal', 8, 0.8);
    add('fast', 4, 0.5);
  } else if (wave <= 14) {
    add('regen', wave - 8, 1.3);
    add('fast', 8, 0.5);
    add('tank', 3, 1.4);
  } else {
    add('shield', wave - 10, 1.2);
    add('tank', 5, 1.2);
    add('regen', 4, 1.0);
    add('fast', 10, 0.4);
  }
  const t = wave - 1;
  const hpMult = (1 + 0.15 * t + 0.018 * t * t) * (1 + 0.4 * mapIndex);
  const speedMult = 1 + 0.012 * t;
  return { entries, hpMult, speedMult };
}

// ---------------- 状態 ----------------
export const WAVE_INTERVAL = 12; // ウェーブ撃退後、次波が自動で来るまでの秒数
export const EARLY_CALL_RATE = 2; // 早呼びボーナス: 残り秒数 × この係数のゴールド
export const COMBO_WINDOW = 2.5; // この秒数以内の連続撃破でコンボ継続
export const COMBO_BONUS = 0.1; // コンボ1段ごとの報奨金倍率アップ（最大2倍）

function runFields(mapIndex) {
  const map = MAPS[mapIndex];
  return {
    mapIndex,
    path: buildPath(map.waypoints),
    gold: START_GOLD,
    lives: START_LIVES,
    score: 0,
    wave: 0,
    totalWaves: map.totalWaves,
    endless: false,
    nextWaveTimer: 0,
    combo: { count: 0, timer: 0 },
    maxCombo: 0,
    waveActive: false,
    waveMods: { hpMult: 1, speedMult: 1 },
    spawnQueue: [],
    spawnTimer: 0,
    enemies: [],
    towers: [],
    projectiles: [],
    effects: [],
    events: [],
    waveBanner: null,
    gameSpeed: 1,
    nextId: 1,
    time: 0,
  };
}

export function createState({ mapIndex = 0 } = {}) {
  return { status: 'title', ...runFields(mapIndex) };
}

function pushEvent(state, type) {
  state.events.push(type);
  if (state.events.length > 50) state.events.shift();
}

function pushEffect(state, effect) {
  state.effects.push(effect);
  if (state.effects.length > 80) state.effects.shift();
}

// ---------------- アクション ----------------
export function startGame(state, mapIndex = state.mapIndex, endless = false) {
  Object.assign(state, runFields(mapIndex), { status: 'playing', endless });
}

export function toTitle(state) {
  state.status = 'title';
}

export function togglePause(state) {
  if (state.status === 'playing') state.status = 'paused';
  else if (state.status === 'paused') state.status = 'playing';
}

export function cycleSpeed(state) {
  state.gameSpeed = state.gameSpeed >= 3 ? 1 : state.gameSpeed + 1;
}

export function canBuildAt(state, c, r) {
  if (c < 0 || c >= GRID.cols || r < 0 || r >= GRID.rows) return false;
  if (state.path.cells.has(`${c},${r}`)) return false;
  if (state.towers.some((t) => t.c === c && t.r === r)) return false;
  return true;
}

export function placeTower(state, type, c, r) {
  if (state.status !== 'playing') return false;
  const def = TOWER_TYPES[type];
  if (!def || !canBuildAt(state, c, r) || state.gold < def.cost) return false;
  const { x, y } = cellCenter(c, r);
  state.gold -= def.cost;
  state.towers.push({ id: state.nextId++, type, c, r, x, y, level: 1, cd: 0, invested: def.cost, kills: 0 });
  pushEvent(state, 'build');
  return true;
}

export function upgradeTower(state, id) {
  if (state.status !== 'playing') return false;
  const tower = state.towers.find((t) => t.id === id);
  if (!tower || tower.level >= 3) return false;
  const cost = TOWER_TYPES[tower.type].upgradeCost[tower.level - 1];
  if (state.gold < cost) return false;
  state.gold -= cost;
  tower.level += 1;
  tower.invested += cost;
  pushEvent(state, 'upgrade');
  pushEffect(state, { kind: 'text', text: 'LV UP!', x: tower.x, y: tower.y - 14, ttl: 0.8, color: '#ffd76a' });
  return true;
}

export function sellTower(state, id) {
  if (state.status !== 'playing') return false;
  const i = state.towers.findIndex((t) => t.id === id);
  if (i < 0) return false;
  const tower = state.towers[i];
  const refund = Math.floor(tower.invested * SELL_RATE);
  state.gold += refund;
  state.towers.splice(i, 1);
  pushEvent(state, 'sell');
  pushEffect(state, { kind: 'text', text: `+${refund}G`, x: tower.x, y: tower.y, ttl: 0.8, color: '#ffd76a' });
  return true;
}

export function startNextWave(state) {
  if (state.status !== 'playing' || state.waveActive) return false;
  if (!state.endless && state.wave >= state.totalWaves) return false;
  // 早呼びボーナス（自動カウントダウン中に手動で呼んだ分だけ恩賞）
  if (state.nextWaveTimer > 0) {
    const bonus = Math.ceil(state.nextWaveTimer * EARLY_CALL_RATE);
    state.gold += bonus;
    state.score += bonus;
    pushEffect(state, {
      kind: 'text', text: `早呼び恩賞 +${bonus}G`, x: WORLD.w / 2, y: 292, ttl: 1.1, max: 1.1, color: '#f2d489',
    });
    pushEvent(state, 'earlyCall');
    state.nextWaveTimer = 0;
  }
  state.wave += 1;
  const w = makeWave(state.mapIndex, state.wave);
  state.spawnQueue = [...w.entries];
  state.waveMods = { hpMult: w.hpMult, speedMult: w.speedMult };
  state.spawnTimer = 0;
  state.waveActive = true;
  state.waveBanner = { wave: state.wave, boss: state.wave % 10 === 0, ttl: 2.2, max: 2.2 };
  pushEvent(state, 'waveStart');
  return true;
}

// テストからも使うヘルパー：敵を1体スポーンする
export function spawnEnemy(state, type, dist = 0) {
  const base = ENEMY_TYPES[type];
  const mods = state.waveMods;
  const pos = pointAt(state.path, dist);
  const enemy = {
    id: state.nextId++,
    type,
    hp: Math.round(base.hp * mods.hpMult),
    maxHp: Math.round(base.hp * mods.hpMult),
    speed: base.speed * mods.speedMult,
    armor: base.armor,
    regen: base.regen,
    bounty: base.bounty,
    livesCost: base.livesCost,
    radius: base.radius,
    slowResist: !!base.slowResist,
    dist,
    x: pos.x,
    y: pos.y,
    slowMult: 1,
    slowTimer: 0,
    hitTimer: 0,
    dead: false,
    leaked: false,
  };
  state.enemies.push(enemy);
  return enemy;
}

// ---------------- ダメージ処理 ----------------
// 敵にダメージを与える。この一撃で倒したときだけ true を返す
function damageEnemy(state, enemy, dmg, pierce = false) {
  if (enemy.dead) return false;
  const eff = Math.max(1, dmg - (pierce ? 0 : enemy.armor));
  enemy.hp -= eff;
  enemy.hitTimer = 0.12; // 被弾フラッシュ
  pushEffect(state, {
    kind: 'dmg', text: String(eff),
    x: enemy.x + ((state.nextId % 5) - 2) * 4, y: enemy.y - enemy.radius - 2,
    ttl: 0.55, max: 0.55,
  });
  if (enemy.hp <= 0) {
    enemy.dead = true;
    // コンボ：時間内の連続撃破で報奨金アップ（最大2倍）
    state.combo.count = state.combo.timer > 0 ? state.combo.count + 1 : 1;
    state.combo.timer = COMBO_WINDOW;
    if (state.combo.count > state.maxCombo) state.maxCombo = state.combo.count;
    const mult = Math.min(2, 1 + COMBO_BONUS * (state.combo.count - 1));
    const reward = Math.round(enemy.bounty * mult);
    state.gold += reward;
    state.score += reward;
    pushEvent(state, 'kill');
    if (state.combo.count >= 3) pushEvent(state, 'combo');
    pushEffect(state, { kind: 'text', text: `+${reward}`, x: enemy.x, y: enemy.y - 10, ttl: 0.7, color: '#ffe98a' });
    pushEffect(state, { kind: 'pop', x: enemy.x, y: enemy.y, r: enemy.radius + 6, ttl: 0.3, max: 0.3 });
    pushEffect(state, { kind: 'soul', etype: enemy.type, x: enemy.x, y: enemy.y - 4, ttl: 0.8, max: 0.8 });
    return true;
  }
  return false;
}

function applySlow(state, enemy, slowMult, slowTime) {
  let mult = slowMult;
  if (enemy.slowResist) mult = Math.max(mult, 0.6);
  if (mult <= enemy.slowMult || enemy.slowTimer <= 0) {
    enemy.slowMult = mult;
    enemy.slowTimer = slowTime;
  }
}

// ---------------- 更新 ----------------
export function update(state, rawDt) {
  if (state.status !== 'playing') return;
  const dt = Math.min(rawDt, 0.05) * state.gameSpeed;
  state.time += dt;

  if (state.waveBanner) {
    state.waveBanner.ttl -= dt;
    if (state.waveBanner.ttl <= 0) state.waveBanner = null;
  }

  // コンボ窓の減衰
  if (state.combo.timer > 0) {
    state.combo.timer -= dt;
    if (state.combo.timer <= 0) state.combo.count = 0;
  }

  // 次ウェーブの自動カウントダウン
  if (state.nextWaveTimer > 0 && !state.waveActive) {
    state.nextWaveTimer -= dt;
    if (state.nextWaveTimer <= 0) {
      state.nextWaveTimer = 0;
      startNextWave(state);
    }
  }

  spawnStep(state, dt);
  enemyStep(state, dt);
  towerStep(state, dt);
  projectileStep(state, dt);
  effectStep(state, dt);

  state.enemies = state.enemies.filter((e) => !e.dead && !e.leaked);

  if (state.lives <= 0) {
    state.lives = 0;
    state.status = 'gameover';
    pushEvent(state, 'gameover');
    return;
  }

  // ウェーブ終了判定
  if (state.waveActive && state.spawnQueue.length === 0 && state.enemies.length === 0) {
    state.waveActive = false;
    const bonus = 25 + state.wave * 5;
    state.gold += bonus;
    state.score += bonus;
    pushEffect(state, {
      kind: 'text', text: `撃退！ 恩賞 +${bonus}G`, x: WORLD.w / 2, y: 262, ttl: 1.4, max: 1.4, color: '#f2d489',
    });
    pushEvent(state, 'waveClear');
    if (!state.endless && state.wave >= state.totalWaves) {
      state.score += state.lives * 20;
      state.status = 'victory';
      pushEvent(state, 'victory');
    } else {
      state.nextWaveTimer = WAVE_INTERVAL;
    }
  }
}

function spawnStep(state, dt) {
  if (!state.waveActive || state.spawnQueue.length === 0) return;
  state.spawnTimer -= dt;
  while (state.spawnTimer <= 0 && state.spawnQueue.length > 0) {
    const entry = state.spawnQueue.shift();
    spawnEnemy(state, entry.type, 0);
    state.spawnTimer += entry.gap;
  }
}

function enemyStep(state, dt) {
  for (const e of state.enemies) {
    if (e.hitTimer > 0) e.hitTimer -= dt;
    if (e.slowTimer > 0) {
      e.slowTimer -= dt;
      if (e.slowTimer <= 0) e.slowMult = 1;
    }
    if (e.regen > 0 && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);
    }
    const speed = e.speed * (e.slowTimer > 0 ? e.slowMult : 1);
    e.dist += speed * dt;
    if (e.dist >= state.path.total) {
      e.leaked = true;
      state.lives -= e.livesCost;
      pushEvent(state, 'leak');
      const goal = state.path.points[state.path.points.length - 1];
      pushEffect(state, { kind: 'pop', x: goal.x, y: goal.y, r: 22, ttl: 0.4, max: 0.4, color: '#ff6a8a' });
      continue;
    }
    const pos = pointAt(state.path, e.dist);
    e.x = pos.x;
    e.y = pos.y;
  }
}

function findTarget(state, tower, range) {
  let best = null;
  for (const e of state.enemies) {
    if (e.dead || e.leaked) continue;
    const dx = e.x - tower.x;
    const dy = e.y - tower.y;
    if (dx * dx + dy * dy > range * range) continue;
    if (!best || e.dist > best.dist) best = e;
  }
  return best;
}

function towerStep(state, dt) {
  for (const tower of state.towers) {
    tower.cd -= dt;
    if (tower.cd > 0) continue;
    const def = TOWER_TYPES[tower.type];
    const stats = towerStats(tower);
    const target = findTarget(state, tower, stats.range);
    if (!target) continue;
    tower.cd = stats.cd;
    pushEvent(state, `shoot-${tower.type}`);
    if (def.hitscan) {
      const tx = target.x;
      const ty = target.y;
      if (damageEnemy(state, target, stats.dmg, !!def.pierce)) tower.kills += 1;
      pushEffect(state, {
        kind: 'beam', x1: tower.x, y1: tower.y, x2: tx, y2: ty, ttl: 0.12, max: 0.12,
      });
      pushEffect(state, { kind: 'spark', x: tx, y: ty, ttl: 0.18, max: 0.18, seed: state.nextId });
    } else {
      state.projectiles.push({
        id: state.nextId++,
        type: tower.type,
        towerId: tower.id,
        x: tower.x,
        y: tower.y,
        tx: target.x,
        ty: target.y,
        targetId: target.id,
        speed: def.projSpeed,
        dmg: stats.dmg,
        splash: stats.splash || 0,
        slowMult: stats.slowMult,
        slowTime: stats.slowTime,
      });
    }
  }
}

function projectileStep(state, dt) {
  const remaining = [];
  for (const p of state.projectiles) {
    const target = state.enemies.find((e) => e.id === p.targetId && !e.dead && !e.leaked);
    if (target) {
      p.tx = target.x;
      p.ty = target.y;
    } else if (p.type !== 'cannon') {
      continue; // ターゲット消滅：キャノン以外は消える（キャノンは最終地点で爆発）
    }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (d <= step + 4) {
      impact(state, p, target);
      continue;
    }
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
    remaining.push(p);
  }
  state.projectiles = remaining;
}

function impact(state, p, target) {
  if (p.type === 'cannon') {
    pushEffect(state, { kind: 'boom', x: p.tx, y: p.ty, r: p.splash, ttl: 0.3, max: 0.3 });
    for (const e of state.enemies) {
      if (e.dead || e.leaked) continue;
      const dx = e.x - p.tx;
      const dy = e.y - p.ty;
      if (dx * dx + dy * dy <= p.splash * p.splash) {
        if (damageEnemy(state, e, p.dmg)) creditKill(state, p);
      }
    }
    return;
  }
  if (!target) return;
  if (damageEnemy(state, target, p.dmg)) creditKill(state, p);
  if (p.type === 'arrow') {
    pushEffect(state, { kind: 'spark', x: target.x, y: target.y, ttl: 0.18, max: 0.18, seed: p.id });
  }
  if (p.type === 'frost') {
    applySlow(state, target, p.slowMult, p.slowTime);
    pushEffect(state, { kind: 'pop', x: target.x, y: target.y, r: target.radius + 4, ttl: 0.25, max: 0.25, color: '#9fdcff' });
  }
}

function creditKill(state, p) {
  const tower = state.towers.find((t) => t.id === p.towerId);
  if (tower) tower.kills += 1;
}

function effectStep(state, dt) {
  for (const fx of state.effects) {
    fx.ttl -= dt;
    if (fx.kind === 'text') fx.y -= 22 * dt;
  }
  state.effects = state.effects.filter((fx) => fx.ttl > 0);
}
