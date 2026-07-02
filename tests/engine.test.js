import { describe, it, expect } from 'vitest';
import {
  createGame,
  createRng,
  setPlayerTarget,
  spawnObstacle,
  startGame,
  update,
  OBSTACLE_RADIUS_MAX,
  OBSTACLE_RADIUS_MIN,
  OBSTACLE_SPEED_MAX,
  OBSTACLE_SPEED_MIN,
  OBSTACLE_TYPES,
  PLAYER_BASE_SPEED,
  SPAWN_INTERVAL,
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
