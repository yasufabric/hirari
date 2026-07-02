import { describe, it, expect } from 'vitest';
import { createGame, createRng, startGame, update, WORLD } from '../src/engine.js';

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
