# 城まもり！ (Shiro Mamori)

スマホ向け和風タワーディフェンスゲーム。侍・巫女などの守り手を配置して、鳥居から攻めてくる妖怪（おばけ・天狗・鬼・九尾の狐…）からお城を守るステージクリア型ゲーム。

## アーキテクチャ

ビルドステップなし・バンドラーなし・バニラJS ESモジュール。

- `src/engine.js` — 純粋ロジックのみ。**DOM/Canvas/window 禁止**。すべてユニットテスト可能。マップ・妖怪・タワー・ウェーブの定義もここ。
- `src/layout.js` — ボタン配置の純粋ロジック。renderer（描画）と main（当たり判定）で共用。
- `src/renderer.js` — Canvas描画のみ。ゲーム状態を読むだけで**変更しない**。
- `src/sfx.js` — WebAudioの和風サウンドエンジン。琴・太鼓・銅鑼の合成音とモード別プロシージャルBGM（title/calm/battle）。失敗しても無視される。
- `src/main.js` — ゲームループ（requestAnimationFrame）＋入力処理（Pointer Events）＋localStorage進捗保存。engineとrendererを繋ぐ唯一の場所。
- `index.html` — HTMLシェル。`<script type="module" src="src/main.js">` で読み込む。
- `tests/engine.test.js` — Vitest ユニットテスト（engine.jsのみ対象）。
- `tests/smoke.test.js` — Playwright スモークテスト（実ブラウザで起動確認）。

## インバリアント（破らないこと）

1. `engine.js` は DOM・Canvas・`window`・`Date.now()`・`Math.random()` を直接使わない。時間は `update(state, dt)` の `dt` 経由で受け取る。ウェーブ生成（`makeWave`）は完全に決定的。
2. 論理座標系は固定 `360×640`（`WORLD`）。フィールドは 9×12 セル（1セル40px、`GRID`）。スケーリングは main.js の責務。
3. `update()` は `status === 'playing'` のときだけゲームを進める。タイトル・ポーズ・リザルト中は時間が止まる。
4. renderer / layout は state を読み取り専用で扱う。ゲームロジックの変更は engine のみ。
5. マップの `waypoints` は必ず軸平行（縦横のみ）のセグメントで構成する。道のセルにはタワーを建てられない。
6. 効果音・進捗保存は `state.events` キューを main.js が消費して行う。engine は文字列イベントを積むだけ。
7. 新しいゲームルールを足すときは必ず `tests/engine.test.js` にテストを追加する。

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

## Git運用（ユーザー方針）

- **プルリクエストは作らない。** 作業ブランチにpushしたら、確認を待たずに main へ直接マージしてよい（`git merge` してmainをpush、またはAPI経由の即マージ）。
- テスト（`npm test`）が通っていることがマージの唯一の条件。
- 進め方の確認は不要。ほぼ完全自動で進めてよい。
- mainにマージすると GitHub Pages（ブランチ方式）に自動で公開される。
