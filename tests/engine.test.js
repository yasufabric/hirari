import { describe, it, expect } from 'vitest';
import {
  WORLD, GRID, MAPS, ENEMY_TYPES, TOWER_TYPES, START_GOLD, START_LIVES, SELL_RATE,
  WAVE_INTERVAL, EARLY_CALL_RATE,
  createState, startGame, update, togglePause, cycleSpeed, toTitle,
  buildPath, pointAt, cellCenter, pointToCell, canBuildAt,
  placeTower, upgradeTower, sellTower, startNextWave, spawnEnemy, makeWave, towerStats,
} from '../src/engine.js';

function playingState(mapIndex = 0) {
  const state = createState();
  startGame(state, mapIndex);
  return state;
}

function simulate(state, seconds, step = 1 / 60) {
  const n = Math.ceil(seconds / step);
  for (let i = 0; i < n; i++) update(state, step);
}

describe('パス（道）', () => {
  it('軸平行セグメントの長さを正しく合計する', () => {
    const path = buildPath([[0, 0], [4, 0], [4, 3]]);
    // 4セル分の横 + 3セル分の縦 = (160 + 120)
    expect(path.total).toBe(280);
  });

  it('通ったセルがすべて cells に含まれる', () => {
    const path = buildPath([[0, 0], [2, 0], [2, 2]]);
    for (const key of ['0,0', '1,0', '2,0', '2,1', '2,2']) {
      expect(path.cells.has(key)).toBe(true);
    }
    expect(path.cells.size).toBe(5);
  });

  it('pointAt は始点・終点・中間点を返す', () => {
    const path = buildPath([[0, 0], [2, 0]]);
    expect(pointAt(path, 0)).toEqual(cellCenter(0, 0));
    expect(pointAt(path, path.total)).toEqual(cellCenter(2, 0));
    const mid = pointAt(path, 40);
    expect(mid.x).toBeCloseTo(cellCenter(1, 0).x);
    expect(mid.y).toBeCloseTo(cellCenter(1, 0).y);
  });

  it('全マップのwaypointsは軸平行かつグリッド内', () => {
    for (const map of MAPS) {
      for (let i = 0; i < map.waypoints.length; i++) {
        const [c, r] = map.waypoints[i];
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(GRID.cols);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(GRID.rows);
        if (i > 0) {
          const [pc, pr] = map.waypoints[i - 1];
          expect(pc === c || pr === r).toBe(true); // 軸平行
        }
      }
    }
  });
});

describe('状態と開始', () => {
  it('createState はタイトル画面から始まる', () => {
    const state = createState();
    expect(state.status).toBe('title');
  });

  it('startGame で初期リソースが設定される', () => {
    const state = playingState(1);
    expect(state.status).toBe('playing');
    expect(state.mapIndex).toBe(1);
    expect(state.gold).toBe(START_GOLD);
    expect(state.lives).toBe(START_LIVES);
    expect(state.wave).toBe(0);
    expect(state.towers).toEqual([]);
    expect(state.enemies).toEqual([]);
  });

  it('update はplaying以外では何もしない', () => {
    const state = createState();
    update(state, 1);
    expect(state.time).toBe(0);
    startGame(state, 0);
    togglePause(state);
    expect(state.status).toBe('paused');
    update(state, 1);
    expect(state.time).toBe(0);
    togglePause(state);
    update(state, 0.016);
    expect(state.time).toBeGreaterThan(0);
  });

  it('cycleSpeed は 1→2→3→1 と巡回する', () => {
    const state = playingState();
    expect(state.gameSpeed).toBe(1);
    cycleSpeed(state);
    expect(state.gameSpeed).toBe(2);
    cycleSpeed(state);
    expect(state.gameSpeed).toBe(3);
    cycleSpeed(state);
    expect(state.gameSpeed).toBe(1);
  });

  it('gameSpeed 2 でゲーム内時間が2倍進む', () => {
    const a = playingState();
    const b = playingState();
    b.gameSpeed = 2;
    simulate(a, 1);
    simulate(b, 1);
    expect(b.time).toBeCloseTo(a.time * 2, 5);
  });
});

describe('タワー建設', () => {
  it('空きマスに建てられてゴールドが減る', () => {
    const state = playingState();
    expect(placeTower(state, 'arrow', 1, 2)).toBe(true);
    expect(state.towers).toHaveLength(1);
    expect(state.gold).toBe(START_GOLD - TOWER_TYPES.arrow.cost);
  });

  it('道の上には建てられない', () => {
    const state = playingState();
    // マップ0の道: (0,1)〜(6,1)
    expect(canBuildAt(state, 3, 1)).toBe(false);
    expect(placeTower(state, 'arrow', 3, 1)).toBe(false);
  });

  it('同じマスに重ねて建てられない', () => {
    const state = playingState();
    placeTower(state, 'arrow', 1, 2);
    expect(placeTower(state, 'frost', 1, 2)).toBe(false);
  });

  it('ゴールド不足なら建てられない', () => {
    const state = playingState();
    state.gold = 10;
    expect(placeTower(state, 'arrow', 1, 2)).toBe(false);
    expect(state.towers).toHaveLength(0);
  });

  it('グリッド外には建てられない', () => {
    const state = playingState();
    expect(placeTower(state, 'arrow', -1, 0)).toBe(false);
    expect(placeTower(state, 'arrow', 0, GRID.rows)).toBe(false);
  });
});

describe('強化と売却', () => {
  it('強化でレベルが上がりコストを払う', () => {
    const state = playingState();
    placeTower(state, 'arrow', 1, 2);
    const tower = state.towers[0];
    const goldBefore = state.gold;
    expect(upgradeTower(state, tower.id)).toBe(true);
    expect(tower.level).toBe(2);
    expect(state.gold).toBe(goldBefore - TOWER_TYPES.arrow.upgradeCost[0]);
    expect(towerStats(tower).dmg).toBe(TOWER_TYPES.arrow.levels[1].dmg);
  });

  it('レベル3以上には強化できない', () => {
    const state = playingState();
    state.gold = 9999;
    placeTower(state, 'arrow', 1, 2);
    const tower = state.towers[0];
    upgradeTower(state, tower.id);
    upgradeTower(state, tower.id);
    expect(tower.level).toBe(3);
    expect(upgradeTower(state, tower.id)).toBe(false);
  });

  it('売却で投資額の60%が戻る', () => {
    const state = playingState();
    state.gold = 9999;
    placeTower(state, 'cannon', 1, 2);
    upgradeTower(state, state.towers[0].id);
    const invested = TOWER_TYPES.cannon.cost + TOWER_TYPES.cannon.upgradeCost[0];
    const goldBefore = state.gold;
    expect(sellTower(state, state.towers[0].id)).toBe(true);
    expect(state.towers).toHaveLength(0);
    expect(state.gold).toBe(goldBefore + Math.floor(invested * SELL_RATE));
  });
});

describe('ウェーブ', () => {
  it('makeWave は決定的で、後半ほどHP倍率が上がる', () => {
    const w1 = makeWave(0, 1);
    const w1b = makeWave(0, 1);
    expect(w1).toEqual(w1b);
    expect(makeWave(0, 15).hpMult).toBeGreaterThan(makeWave(0, 5).hpMult);
    expect(makeWave(2, 1).hpMult).toBeGreaterThan(makeWave(0, 1).hpMult);
  });

  it('10の倍数ウェーブにはボスが出る', () => {
    expect(makeWave(0, 10).entries.some((e) => e.type === 'boss')).toBe(true);
    expect(makeWave(0, 20).entries.filter((e) => e.type === 'boss')).toHaveLength(2);
    expect(makeWave(0, 5).entries.some((e) => e.type === 'boss')).toBe(false);
  });

  it('startNextWave でスポーンが始まり、間隔をあけて敵が出る', () => {
    const state = playingState();
    expect(startNextWave(state)).toBe(true);
    expect(state.wave).toBe(1);
    expect(state.waveActive).toBe(true);
    update(state, 0.016);
    expect(state.enemies.length).toBe(1); // 最初の1体は即スポーン
    simulate(state, 1.2);
    expect(state.enemies.length).toBeGreaterThan(1);
  });

  it('ウェーブ開始で襲来バナーが出て、時間経過で消える', () => {
    const state = playingState();
    startNextWave(state);
    expect(state.waveBanner).toMatchObject({ wave: 1, boss: false });
    simulate(state, 3);
    expect(state.waveBanner).toBeNull();
  });

  it('ウェーブ進行中は次のウェーブを開始できない', () => {
    const state = playingState();
    startNextWave(state);
    expect(startNextWave(state)).toBe(false);
    expect(state.wave).toBe(1);
  });

  it('全滅させるとウェーブクリアでボーナスゴールド', () => {
    const state = playingState();
    startNextWave(state);
    state.spawnQueue = [];
    state.enemies = [];
    const goldBefore = state.gold;
    update(state, 0.016);
    expect(state.waveActive).toBe(false);
    expect(state.gold).toBe(goldBefore + 25 + state.wave * 5);
  });

  it('最終ウェーブをクリアすると勝利', () => {
    const state = playingState();
    state.wave = state.totalWaves;
    state.waveActive = true;
    state.spawnQueue = [];
    state.enemies = [];
    update(state, 0.016);
    expect(state.status).toBe('victory');
    expect(state.events).toContain('victory');
  });
});

describe('敵の移動とリーク', () => {
  it('敵は道に沿って進む', () => {
    const state = playingState();
    const e = spawnEnemy(state, 'normal');
    const x0 = e.x;
    simulate(state, 1);
    expect(e.dist).toBeCloseTo(ENEMY_TYPES.normal.speed, 0);
    expect(e.x).toBeGreaterThan(x0);
  });

  it('ゴールに到達するとライフが減って敵は消える', () => {
    const state = playingState();
    spawnEnemy(state, 'normal', state.path.total - 1);
    update(state, 0.1);
    expect(state.lives).toBe(START_LIVES - ENEMY_TYPES.normal.livesCost);
    expect(state.enemies).toHaveLength(0);
    expect(state.events).toContain('leak');
  });

  it('ボスのリークは5ライフ減る', () => {
    const state = playingState();
    spawnEnemy(state, 'boss', state.path.total - 1);
    simulate(state, 0.3); // ボスは遅いので数フレームかけてゴールさせる
    expect(state.lives).toBe(START_LIVES - 5);
  });

  it('ライフが0になるとゲームオーバー', () => {
    const state = playingState();
    state.lives = 1;
    spawnEnemy(state, 'normal', state.path.total - 1);
    update(state, 0.1);
    expect(state.status).toBe('gameover');
    expect(state.lives).toBe(0);
  });

  it('化けだぬきは自然回復する', () => {
    const state = playingState();
    const e = spawnEnemy(state, 'regen');
    e.hp -= 20;
    const hpBefore = e.hp;
    simulate(state, 2);
    expect(e.hp).toBeGreaterThan(hpBefore);
    expect(e.hp).toBeLessThanOrEqual(e.maxHp);
  });
});

describe('タワーの攻撃', () => {
  it('アロータワーが敵を倒して報奨金を得る', () => {
    const state = playingState();
    placeTower(state, 'arrow', 5, 2); // 道の角をカバーする位置（滞在時間が長い）
    const goldAfterBuild = state.gold;
    spawnEnemy(state, 'normal', 160);
    simulate(state, 6);
    expect(state.enemies).toHaveLength(0);
    expect(state.gold).toBe(goldAfterBuild + ENEMY_TYPES.normal.bounty);
    expect(state.towers[0].kills).toBe(1);
    expect(state.events).toContain('kill');
    expect(state.events).toContain('shoot-arrow');
  });

  it('射程外の敵は撃たない', () => {
    const state = playingState();
    placeTower(state, 'arrow', 1, 2);
    spawnEnemy(state, 'normal', state.path.total - 200); // 画面下の方（射程外）
    update(state, 0.016);
    expect(state.projectiles).toHaveLength(0);
  });

  it('キャノンは範囲内の複数の敵にダメージ', () => {
    const state = playingState();
    placeTower(state, 'cannon', 1, 2);
    const e1 = spawnEnemy(state, 'tank', 40);
    const e2 = spawnEnemy(state, 'tank', 55);
    simulate(state, 2);
    expect(e1.hp).toBeLessThan(e1.maxHp);
    expect(e2.hp).toBeLessThan(e2.maxHp);
  });

  it('アイスタワーは敵を遅くする', () => {
    const state = playingState();
    placeTower(state, 'frost', 1, 2);
    const e = spawnEnemy(state, 'tank', 40);
    simulate(state, 1.5);
    expect(e.slowTimer).toBeGreaterThan(0);
    expect(e.slowMult).toBe(TOWER_TYPES.frost.levels[0].slowMult);
  });

  it('ボスはスロー耐性で0.6未満にならない', () => {
    const state = playingState();
    placeTower(state, 'frost', 1, 2);
    const e = spawnEnemy(state, 'boss', 40);
    simulate(state, 1.5);
    expect(e.slowTimer).toBeGreaterThan(0);
    expect(e.slowMult).toBe(0.6);
  });

  it('スナイパーは即着弾で防御を無視する', () => {
    const state = playingState();
    placeTower(state, 'sniper', 1, 2);
    const e = spawnEnemy(state, 'shield', 40);
    update(state, 0.016);
    expect(e.hp).toBe(e.maxHp - TOWER_TYPES.sniper.levels[0].dmg);
  });

  it('防御力はダメージを減らす（最低1）', () => {
    const state = playingState();
    placeTower(state, 'arrow', 1, 2);
    const e = spawnEnemy(state, 'shield', 40); // armor 4, arrow dmg 8 → 4ずつ
    let steps = 0;
    while (e.hp === e.maxHp && steps < 600) {
      update(state, 1 / 60);
      steps++;
    }
    expect(e.maxHp - e.hp).toBe(TOWER_TYPES.arrow.levels[0].dmg - ENEMY_TYPES.shield.armor);
  });

  it('ターゲットは射程内で最も進んでいる敵', () => {
    const state = playingState();
    placeTower(state, 'sniper', 1, 2);
    const back = spawnEnemy(state, 'tank', 30);
    const front = spawnEnemy(state, 'tank', 80);
    update(state, 0.016);
    expect(front.hp).toBeLessThan(front.maxHp);
    expect(back.hp).toBe(back.maxHp);
  });
});

describe('コンボ', () => {
  it('時間内の連続撃破でコンボが伸び、報奨金が増える', () => {
    const state = playingState();
    placeTower(state, 'arrow', 1, 2);
    const goldAfterBuild = state.gold;
    const e1 = spawnEnemy(state, 'normal', 40);
    const e2 = spawnEnemy(state, 'normal', 55);
    e1.hp = 1;
    e2.hp = 1;
    simulate(state, 3);
    expect(state.enemies).toHaveLength(0);
    expect(state.maxCombo).toBe(2);
    // 1体目は等倍6G、2体目はコンボ×1.1で round(6.6)=7G
    expect(state.gold).toBe(goldAfterBuild + 6 + 7);
    expect(state.events).toContain('kill');
  });

  it('時間が空くとコンボはリセットされる', () => {
    const state = playingState();
    const e = spawnEnemy(state, 'normal', 40);
    e.hp = 0.5;
    placeTower(state, 'sniper', 1, 2);
    update(state, 0.016);
    expect(state.combo.count).toBe(1);
    simulate(state, 3); // COMBO_WINDOW超え
    expect(state.combo.count).toBe(0);
    expect(state.maxCombo).toBe(1);
  });

  it('被弾した敵にはヒットフラッシュのタイマーが付く', () => {
    const state = playingState();
    placeTower(state, 'sniper', 1, 2);
    const e = spawnEnemy(state, 'tank', 40);
    update(state, 0.016);
    expect(e.hitTimer).toBeGreaterThan(0);
  });
});

describe('自動カウントダウンと早呼び', () => {
  function clearWave(state) {
    startNextWave(state);
    state.spawnQueue = [];
    state.enemies = [];
    update(state, 0.016);
  }

  it('ウェーブ撃退後にカウントダウンが始まり、0で次波が自動開始', () => {
    const state = playingState();
    clearWave(state);
    expect(state.waveActive).toBe(false);
    expect(state.nextWaveTimer).toBe(WAVE_INTERVAL);
    simulate(state, WAVE_INTERVAL + 0.2);
    expect(state.wave).toBe(2);
    expect(state.waveActive).toBe(true);
  });

  it('カウントダウン中に手動で呼ぶと残り時間分のボーナス', () => {
    const state = playingState();
    clearWave(state);
    const goldBefore = state.gold;
    expect(startNextWave(state)).toBe(true);
    expect(state.wave).toBe(2);
    expect(state.gold).toBe(goldBefore + Math.ceil(WAVE_INTERVAL * EARLY_CALL_RATE));
    expect(state.events).toContain('earlyCall');
    expect(state.nextWaveTimer).toBe(0);
  });

  it('最終ウェーブクリア後はカウントダウンしない（通常モード）', () => {
    const state = playingState();
    state.wave = state.totalWaves;
    state.waveActive = true;
    state.spawnQueue = [];
    state.enemies = [];
    update(state, 0.016);
    expect(state.status).toBe('victory');
    expect(state.nextWaveTimer).toBe(0);
  });
});

describe('エンドレスモード', () => {
  it('第20波を超えても勝利にならず戦いが続く', () => {
    const state = createState();
    startGame(state, 0, true);
    expect(state.endless).toBe(true);
    state.wave = state.totalWaves;
    state.waveActive = true;
    state.spawnQueue = [];
    state.enemies = [];
    update(state, 0.016);
    expect(state.status).toBe('playing');
    expect(state.nextWaveTimer).toBe(WAVE_INTERVAL);
    expect(startNextWave(state)).toBe(true);
    expect(state.wave).toBe(state.totalWaves + 1);
  });

  it('第21波以降のウェーブも生成できる', () => {
    const w = makeWave(0, 25);
    expect(w.entries.length).toBeGreaterThan(0);
    expect(w.hpMult).toBeGreaterThan(makeWave(0, 20).hpMult);
    expect(makeWave(0, 30).entries.filter((e) => e.type === 'boss')).toHaveLength(3);
  });

  it('通常モードでは最終ウェーブ後に開始できない', () => {
    const state = playingState();
    state.wave = state.totalWaves;
    expect(startNextWave(state)).toBe(false);
  });
});

describe('その他', () => {
  it('pointToCell はフィールド内のセルを返し、外はnull', () => {
    expect(pointToCell(20, GRID.top + 20)).toEqual({ c: 0, r: 0 });
    expect(pointToCell(WORLD.w - 1, GRID.top + GRID.rows * GRID.cell - 1))
      .toEqual({ c: GRID.cols - 1, r: GRID.rows - 1 });
    expect(pointToCell(10, 10)).toBeNull(); // HUD領域
    expect(pointToCell(10, 630)).toBeNull(); // パネル領域
  });

  it('toTitle でタイトルに戻る', () => {
    const state = playingState();
    toTitle(state);
    expect(state.status).toBe('title');
  });

  it('大きなdtはクランプされる（1回のupdateで暴走しない）', () => {
    const state = playingState();
    spawnEnemy(state, 'normal');
    update(state, 10); // タブ復帰などの巨大dt
    expect(state.enemies[0].dist).toBeLessThanOrEqual(ENEMY_TYPES.normal.speed * 0.05 + 0.001);
  });
});
