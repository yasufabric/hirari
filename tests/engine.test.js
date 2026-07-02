import { describe, it, expect } from 'vitest';
import {
  advanceStage,
  chooseSkill,
  circlesHit,
  createGame,
  createRng,
  setPlayerTarget,
  spawnObstacle,
  startGame,
  update,
  INVINCIBLE_DURATION,
  MAX_HP,
  OBSTACLE_RADIUS_MAX,
  OBSTACLE_RADIUS_MIN,
  OBSTACLE_SPEED_MAX,
  OBSTACLE_SPEED_MIN,
  OBSTACLE_TYPES,
  PLAYER_BASE_SPEED,
  SKILL_CHOICE_COUNT,
  SKILLS,
  SPAWN_INTERVAL,
  STAGE_CLEAR_BONUS,
  STAGE_DURATION,
  WORLD,
} from '../src/engine.js';

function playingGame(seed = 1) {
  const state = createGame(seed);
  startGame(state);
  return state;
}

describe('createGame', () => {
  it('タイトル状態で始まる', () => {
    const state = createGame(1);
    expect(state.status).toBe('title');
    expect(state.world).toEqual(WORLD);
  });
});

describe('createRng', () => {
  it('同じシードなら同じ列を返す（決定論的）', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('0以上1未満の値を返す', () => {
    const rng = createRng(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('update', () => {
  it('playing 中だけ時間が進む', () => {
    const state = createGame(1);
    update(state, 0.5);
    expect(state.time).toBe(0);
    startGame(state);
    update(state, 0.5);
    expect(state.time).toBe(0.5);
  });
});

describe('プレイヤー移動', () => {
  it('初期位置は画面下寄り中央', () => {
    const { player } = createGame(1);
    expect(player.x).toBe(WORLD.width / 2);
    expect(player.y).toBe(WORLD.height * 0.8);
  });

  it('ターゲットに向かって maxSpeed で移動する', () => {
    const state = playingGame();
    const startX = state.player.x;
    setPlayerTarget(state, startX + 1000, state.player.y); // 右方向遠く（クランプされて右端）
    update(state, 0.1);
    expect(state.player.x).toBeCloseTo(startX + PLAYER_BASE_SPEED * 0.1);
  });

  it('ターゲットが近いと通り過ぎずぴったり止まる', () => {
    const state = playingGame();
    const tx = state.player.x + 5;
    const ty = state.player.y;
    setPlayerTarget(state, tx, ty);
    update(state, 1.0); // 1秒で340px動ける距離
    expect(state.player.x).toBe(tx);
    expect(state.player.y).toBe(ty);
  });

  it('ターゲットは画面内（半径ぶん内側）にクランプされる', () => {
    const state = playingGame();
    setPlayerTarget(state, -100, 99999);
    expect(state.player.targetX).toBe(state.player.r);
    expect(state.player.targetY).toBe(WORLD.height - state.player.r);
  });

  it('playing 以外では動かない', () => {
    const state = createGame(1); // title のまま
    const { x, y } = state.player;
    setPlayerTarget(state, 10, 10);
    update(state, 1.0);
    expect(state.player.x).toBe(x);
    expect(state.player.y).toBe(y);
  });
});

describe('衝突判定とHP', () => {
  // プレイヤーの真上に障害物を重ねて置くヘルパー
  function placeObstacleOnPlayer(state) {
    const o = spawnObstacle(state);
    o.x = state.player.x;
    o.y = state.player.y;
    return o;
  }

  it('circlesHit は距離が (r+r)*係数 未満で当たり', () => {
    const a = { x: 0, y: 0, r: 10 };
    const b = { x: 15, y: 0, r: 10 };
    expect(circlesHit(a, b)).toBe(true); // 15 < 20*0.8=16
    b.x = 17;
    expect(circlesHit(a, b)).toBe(false);
  });

  it('被弾するとHPが1減り、障害物が消え、無敵になる', () => {
    const state = playingGame();
    placeObstacleOnPlayer(state);
    update(state, 0.001);
    expect(state.hp).toBe(MAX_HP - 1);
    expect(state.obstacles).toHaveLength(0);
    expect(state.invincibleTimer).toBeGreaterThan(0);
  });

  it('無敵中は多重ヒットしない', () => {
    const state = playingGame();
    placeObstacleOnPlayer(state);
    update(state, 0.001); // 1発目
    placeObstacleOnPlayer(state);
    update(state, 0.001); // 無敵中
    expect(state.hp).toBe(MAX_HP - 1);
    expect(state.obstacles).toHaveLength(1); // 消えずに残る
  });

  it('無敵時間が切れたら再び被弾する', () => {
    const state = playingGame();
    placeObstacleOnPlayer(state);
    update(state, 0.001);
    // 無敵時間を経過させる（障害物が落ちて行くので毎回重ね直す）
    update(state, INVINCIBLE_DURATION + 0.01);
    placeObstacleOnPlayer(state);
    update(state, 0.001);
    expect(state.hp).toBe(MAX_HP - 2);
  });

  it('HPが0になるとゲームオーバー', () => {
    const state = playingGame();
    for (let i = 0; i < MAX_HP; i++) {
      state.invincibleTimer = 0;
      placeObstacleOnPlayer(state);
      update(state, 0.001);
    }
    expect(state.hp).toBe(0);
    expect(state.status).toBe('gameover');
  });

  it('ゲームオーバー後は update しても何も進まない', () => {
    const state = playingGame();
    state.status = 'gameover';
    const t = state.time;
    update(state, 1.0);
    expect(state.time).toBe(t);
  });
});

describe('ステージタイマーとクリア', () => {
  // 障害物に当たらないよう毎フレーム掃除しながら、合計ちょうど seconds だけ進める
  function survive(state, seconds, step = 0.1) {
    let remaining = seconds;
    while (remaining > 0) {
      const dt = Math.min(step, remaining);
      state.obstacles = [];
      update(state, dt);
      remaining -= dt;
    }
  }

  it('20秒生き残るとスキル選択になりボーナス加点', () => {
    const state = playingGame();
    survive(state, STAGE_DURATION - 0.05);
    expect(state.status).toBe('playing');
    const scoreBefore = state.score;
    state.obstacles = [];
    update(state, 0.1);
    expect(state.status).toBe('skillSelect');
    expect(state.score).toBe(scoreBefore + STAGE_CLEAR_BONUS);
  });

  it('skillSelect 中は時間が進まない', () => {
    const state = playingGame();
    state.status = 'skillSelect';
    const t = state.time;
    update(state, 1.0);
    expect(state.time).toBe(t);
  });

  it('advanceStage で次ステージが始まり障害物・タイマーがリセットされる', () => {
    const state = playingGame();
    survive(state, STAGE_DURATION + 0.1);
    spawnObstacle(state); // 残骸があっても
    advanceStage(state);
    expect(state.stage).toBe(2);
    expect(state.stageTime).toBe(0);
    expect(state.obstacles).toHaveLength(0);
    expect(state.status).toBe('playing');
  });

  it('クリアと同フレームで被弾してHP0ならgameoverが優先される', () => {
    const state = playingGame();
    survive(state, STAGE_DURATION - 0.05);
    state.hp = 1;
    state.invincibleTimer = 0;
    const o = spawnObstacle(state);
    o.x = state.player.x;
    o.y = state.player.y;
    o.vy = 0;
    update(state, 0.1);
    expect(state.status).toBe('gameover');
  });
});

describe('スキルカード選択', () => {
  function clearedGame(seed = 1) {
    const state = playingGame(seed);
    state.stageTime = STAGE_DURATION; // クリア直前まで進める
    state.obstacles = [];
    update(state, 0.001);
    return state;
  }

  it('クリア時に重複なしの選択肢が3枚提示される', () => {
    const state = clearedGame();
    expect(state.status).toBe('skillSelect');
    expect(state.skillChoices).toHaveLength(SKILL_CHOICE_COUNT);
    const ids = state.skillChoices.map((s) => s.id);
    expect(new Set(ids).size).toBe(SKILL_CHOICE_COUNT);
    for (const s of state.skillChoices) {
      expect(SKILLS).toContain(s);
    }
  });

  it('chooseSkill で効果が適用され次ステージが始まる', () => {
    const state = clearedGame();
    const skill = state.skillChoices[1];
    chooseSkill(state, 1);
    expect(state.skills).toEqual([skill.id]);
    expect(state.skillChoices).toBeNull();
    expect(state.stage).toBe(2);
    expect(state.status).toBe('playing');
  });

  it('範囲外のインデックスでは何も起きない', () => {
    const state = clearedGame();
    chooseSkill(state, 5);
    expect(state.status).toBe('skillSelect');
    expect(state.stage).toBe(1);
  });

  it('playing 中に chooseSkill しても何も起きない', () => {
    const state = playingGame();
    chooseSkill(state, 0);
    expect(state.skills).toEqual([]);
    expect(state.stage).toBe(1);
  });

  it('speed: 移動速度が1.25倍になる', () => {
    const state = playingGame();
    const before = state.player.maxSpeed;
    SKILLS.find((s) => s.id === 'speed').apply(state);
    expect(state.player.maxSpeed).toBeCloseTo(before * 1.25);
  });

  it('guard: 無敵時間が0.5秒延びる', () => {
    const state = playingGame();
    const before = state.invincibleDuration;
    SKILLS.find((s) => s.id === 'guard').apply(state);
    expect(state.invincibleDuration).toBeCloseTo(before + 0.5);
  });

  it('slow: 障害物の落下が15%遅くなる', () => {
    const state = playingGame();
    SKILLS.find((s) => s.id === 'slow').apply(state);
    const o = spawnObstacle(state);
    const y0 = o.y;
    update(state, 0.1);
    expect(o.y).toBeCloseTo(y0 + o.vy * 0.85 * 0.1);
  });

  it('shield: HPの代わりにシールドが1回ダメージを受ける', () => {
    const state = playingGame();
    SKILLS.find((s) => s.id === 'shield').apply(state);
    expect(state.shield).toBe(1);
    const o = spawnObstacle(state);
    o.x = state.player.x;
    o.y = state.player.y;
    update(state, 0.001);
    expect(state.shield).toBe(0);
    expect(state.hp).toBe(MAX_HP); // HPは減らない
    expect(state.invincibleTimer).toBeGreaterThan(0); // 無敵は付く
  });
});

describe('障害物スポーン', () => {
  it('SPAWN_INTERVAL 経過ごとに1個スポーンする', () => {
    const state = playingGame();
    update(state, SPAWN_INTERVAL - 0.01);
    expect(state.obstacles).toHaveLength(0);
    update(state, 0.02);
    expect(state.obstacles).toHaveLength(1);
    update(state, SPAWN_INTERVAL);
    expect(state.obstacles).toHaveLength(2);
  });

  it('スポーンした障害物は画面上端の外・画面幅内・種類は既知のもの', () => {
    const state = playingGame(123);
    for (let i = 0; i < 50; i++) spawnObstacle(state);
    for (const o of state.obstacles) {
      expect(o.y).toBeLessThan(0);
      expect(o.x - o.r).toBeGreaterThanOrEqual(0);
      expect(o.x + o.r).toBeLessThanOrEqual(WORLD.width);
      expect(OBSTACLE_TYPES).toContain(o.type);
      expect(o.vy).toBeGreaterThanOrEqual(OBSTACLE_SPEED_MIN);
      expect(o.vy).toBeLessThanOrEqual(OBSTACLE_SPEED_MAX);
      expect(o.r).toBeGreaterThanOrEqual(OBSTACLE_RADIUS_MIN);
      expect(o.r).toBeLessThanOrEqual(OBSTACLE_RADIUS_MAX);
    }
  });

  it('障害物は vy に従って落下する', () => {
    const state = playingGame();
    const o = spawnObstacle(state);
    const y0 = o.y;
    update(state, 0.1);
    expect(o.y).toBeCloseTo(y0 + o.vy * 0.1);
  });

  it('画面下に抜けたら除去されスコアが増える', () => {
    const state = playingGame();
    const o = spawnObstacle(state);
    o.y = WORLD.height + o.r + 1; // 画面外に置く
    update(state, 0.001);
    expect(state.obstacles).not.toContain(o);
    expect(state.score).toBe(1);
  });
});
