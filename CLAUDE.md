# ひらり (Hirari)

スマホ向けドッジゲーム。ドラッグで女の子キャラ「ひらりちゃん」を動かして、上から降ってくる障害物（星・ハート・バブル）を避けるステージクリア型ゲーム。

## アーキテクチャ

ビルドステップなし・バンドラーなし・バニラJS ESモジュール。

- `src/engine.js` — 純粋ロジックのみ。**DOM/Canvas/window 禁止**。すべてユニットテスト可能。
- `src/renderer.js` — Canvas描画のみ。ゲーム状態を読むだけで**変更しない**。
- `src/main.js` — ゲームループ（requestAnimationFrame）＋入力処理（Pointer Events）。engineとrendererを繋ぐ唯一の場所。
- `index.html` — HTMLシェル。`<script type="module" src="src/main.js">` で読み込む。
- `tests/engine.test.js` — Vitest ユニットテスト（engine.jsのみ対象）。
- `tests/smoke.test.js` — Playwright スモークテスト（実ブラウザで起動確認）。

## インバリアント（破らないこと）

1. `engine.js` は DOM・Canvas・`window`・`Date.now()`・`Math.random()` を直接使わない。乱数はシード付きRNG（state内の `rng`）、時間は `update(state, dt)` の `dt` 経由で受け取る。
2. 論理座標系は固定 `360×640`（`WORLD`）。スケーリングは main.js / renderer.js の責務。
3. `update()` は `status === 'playing'` のときだけゲームを進める。オーバーレイ中（skillSelect / gameover / title）は時間が止まる。
4. 被弾後は必ず無敵時間（`invincibleTimer`）があり、多重ヒットしない。
5. renderer は state を読み取り専用で扱う。ゲームロジックの変更は engine のみ。
6. 新しいゲームルールを足すときは必ず `tests/engine.test.js` にテストを追加する。

## コマンド

```bash
npm run dev        # 開発サーバー起動 (http://localhost:8787)
npm test           # Vitest ユニットテスト
npm run test:e2e   # Playwright スモークテスト
npm run bump       # パッチバージョンを上げる
```

## 開発フロー

- `BACKLOG.md` のタスクを上から1つずつ実装する。
- 各タスク: 実装 → `npm test` が通る → BACKLOG.md のチェックを付ける → コミット。
- コミットメッセージは日本語または英語で「何をしたか」を1行目に書く。
