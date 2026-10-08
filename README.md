# きょうせいタイム

子どもの歯科矯正器具の装着時間を記録する、日本語・モバイル優先の PWA です。
**オフラインファースト**: すべての操作はまず IndexedDB に保存され、オンラインのときだけ Supabase と同期します。

> このアプリは医療診断を行うものではありません。目標時間は歯科医院の指示にしたがって保護者が設定します。

## 概要
- 画面: 設定 / 時間 / カレンダー (下部ナビ)
- 1日に複数回の着脱 (1回の装着 = 1 `WearSession`)、今日の合計・残り・終了予定、記録の追加/修正/論理削除
- 日付またぎ (Asia/Tokyo 基準で日別に分割集計)、連続達成、月間達成、7日/30日集計 (`rangeStats`)
- ごほうびスタンプ (オリジナルの絵柄6種類: はのこ・ほし・おはな・ハート・おうかん・にじ。日付ごとに絵柄が決まる)、達成演出 (`prefers-reduced-motion` 対応)、通知、CSV 書き出し・復元
- 目標時間の変更履歴: 目標を変えても、過去日の達成判定はその日に有効だった目標で行う
- 開始から1分未満で終了した装着は押しまちがいとして記録しない (論理削除)

## 技術構成
React 18 + TypeScript + Vite / React Router / Dexie (IndexedDB) / vite-plugin-pwa (Workbox) / Supabase (Auth + PostgreSQL) / Vitest。
UI フレームワークは使わず CSS を自作。フォントは M PLUS Rounded 1c (SIL OFL, `@fontsource`) をアプリと一緒に配信 (外部 CDN 依存なし)。unicode-range 分割で使う文字だけ読み込み、Service Worker が端末にキャッシュするのでオフラインでも同じ見た目。読み込み前は端末の丸ゴシック → システムフォントにフォールバック。

```
src/
  app/ pages/ components/   画面・UI
  hooks/                    useLive, useNow, useAuth, useInstall ...
  db/indexedDb.ts, repo.ts  Dexie スキーマ / 書き込み (即保存 + outbox)
  lib/time.ts               時間計算 (純粋関数)
  lib/validation.ts         入力検証
  lib/sync.ts               同期エンジン (outbox / pull / LWW)
  lib/remoteSupabase.ts     Supabase 実装
supabase/migrations/        スキーマ + RLS
tests/                      時間計算・オフライン・同期テスト
legacy/                     旧版 (素のHTML/JS)
```

## セットアップ
```bash
npm install
cp .env.example .env   # Supabase を使う場合のみ編集 (未設定でもローカル専用で完全動作)
npm run dev            # 開発サーバー (--host)
npm run build          # tsc + vite build (dist/)
npm run preview        # ビルド確認
npm run lint           # 型チェック
npm test               # Vitest
```
開発モード (`npm run dev`) の設定画面にだけ「サンプル投入/削除」ボタンが出ます (本番ビルドには含まれません)。

## IndexedDB
DB 名 `kyousei-time`。`profiles / children / settings / sessions / outbox / meta`。
全レコードに `userId` と `childId` (子どもは複数対応可能な設計)、ID は UUID (オフライン生成)。初期値は `local-user` / `default-child`。
目標は `dailyTargetMinutes` (分) で保存 (14時間 = 840)。
実行中のタイマーは **`startTime` のみ保存**し、表示は常に「現在時刻 − startTime」から計算します (setInterval の積算は使わない)。ロック・再起動・更新しても継続します。

## プレビュー版
`npm run build:preview` で、サンプルの記録入り・クラウド同期なしのプレビュー版を1つの HTML (`dist-artifact/kyousei-time-preview.html`) に書き出します。claude.ai の Artifact などで、インストールせずに画面を試せます。保存領域が使えない埋め込み表示ではメモリ上で動きます (本番ビルドには含まれません)。

## Supabase / .env
1. `supabase/README.md` の手順で `migrations/` の SQL (0001〜0003) を番号順に実行
2. Email (Magic Link) を有効化し、Redirect URL にデプロイ先を追加
3. `.env`:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
service_role キー等の秘密鍵は絶対にコミットしないでください (`.env` は `.gitignore` 済み)。
RLS: 全テーブルで `user_id = auth.uid()` の行のみ読み書き可 (children も所有者で制限)。anon ロールは権限なし。

## CSV 書き出し・復元
設定画面 → データ。書き出し形式: `日付,開始時間,終了時間,装着時間,目標時間,達成` (日付またぎは日ごとの行に分割、Excel 用 BOM 付き)。復元は同じ形式を読み込み、分割された行を1件に戻します。既存の記録と同一・重なるものは追加しない (既存を優先) ので、同じファイルを何度読み込んでも重複しません。手書きCSVで終了が開始より前の行は翌日扱いです。

## 同期の仕組み
```
操作 → IndexedDB 即保存 (+ outbox に追加) → UI 即反映 → online なら push → pull
```
- outbox はレコード単位 (`table:id`)。送信後に `updatedAt` が変わっていなければ削除。送信中の編集は pending のまま残る。途中でブラウザが終了しても outbox から再送 (upsert なので冪等)。
- 復帰トリガー: `online` イベント / タブ復帰 / 60秒ごと / ローカル書き込み後 / エラー時の指数バックオフ。
- 競合は Last Write Wins (`updatedAt`)。サーバー側トリガーも古い更新を無視。pull はサーバー時刻 `synced_at` カーソルで端末時計のずれに強い。
- 削除は `deletedAt` の論理削除で、他端末で復活しない。装着記録は1回ごとの別レコードなので、2台での記録は上書きでなくマージされる。集計は区間を結合して二重計上を防ぐ。
- 新端末の未編集デフォルト (updatedAt=1970) はクラウドの保存済み設定を上書きしない。
- ログイン時 `local-user` のデータは自分のアカウントに引き継がれる。別アカウントでログインした場合は前のローカルデータを破棄するが、前のアカウントに未同期の記録が残っているときは切り替えを止めて案内する (データ保護)。
- ログアウト後も記録は端末に残り、オフラインで使い続けられる。同じアカウントで再ログインすると未同期分も同期される。
- 表示: ✓同期済み / ↑同期待ち / ↻同期中 / !同期エラー / オフライン / この端末に保存。最終同期時刻と「クラウドにバックアップ済み」表示は設定画面。

## Offline 動作
アプリシェルは Service Worker で precache (Cache First)、データは IndexedDB First、Supabase API はキャッシュせず常にネットワーク (オフライン時は IndexedDB のデータで動作し、復帰後に同期)。API 応答をキャッシュすると、オフライン時に古い応答で「同期済み」と誤表示したり、ログアウト後も個人データがブラウザに残ったりするため、意図的に Service Worker の対象外にしています。`registerType: autoUpdate` + `skipWaiting/clientsClaim/cleanupOutdatedCaches` で古い版は残りません。アプリ起動・設定・装着開始/終了・カレンダー・過去記録はすべて圏外で動作します。

## PWA
`manifest.webmanifest` (自動生成)、アイコン (192/512/maskable/apple-touch)、theme/background color、Safe Area 対応、インストール案内 (Android/PC: インストールボタン、iOS: 共有→ホーム画面に追加)。Badge API 用の `setAppBadge` を `lib/notifications.ts` に用意 (現在は未接続)。

## 通知の制限
Web Notifications を使用 (HTTPS または localhost 必須)。設定で ON にしたとき許可を要求します。
| ケース | 結果 |
|---|---|
| アプリを開いている / バックグラウンドでタブが生きている | 目標到達時に通知 (1日1回) |
| 一度閉じていて、後で開いた | 開いたときに到達済みなら通知 |
| アプリ/ブラウザが完全に終了・端末スリープでタブ停止 | **通知できない** (ブラウザがタイマーを止めるため) |
| iOS | ホーム画面に追加した PWA (iOS 16.4+) のみ通知可 |
| 許可が拒否・非対応 | 画面内の表示のみ |

閉じている間も確実に通知するには **Web Push** が必要です。将来: Supabase Edge Function + `push_subscriptions` テーブル + VAPID 鍵で、装着開始時に「終了予定時刻」の通知をサーバー側で予約し、SW の `push` イベントで表示します (終了予定は `expectedGoalTime` で計算済み)。

## デプロイ
`npm run build` の `dist/` を Vercel / Cloudflare Pages / Netlify に配置。SPA フォールバック (`vercel.json`, `public/_redirects`) と、`sw.js`・`index.html` を毎回確認させるキャッシュ設定 (`public/_headers`, `vercel.json`) を同梱しているので、新しい版を出すと次回起動時に自動で更新されます。ビルド設定: コマンド `npm run build`、出力 `dist`、Node 20 以上。環境変数 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` を設定。Supabase の Redirect URL にデプロイ先を追加。

## テスト
- `npm test` (Vitest): 下記の単体・同期テストに加え、`supabase/migrations` を PGlite (WASM 版 PostgreSQL) で実行して LWW トリガー・RLS・制約・クライアント同期との噛み合わせを検証
- `npm run e2e` (Playwright): 本番ビルドを起動し、iPhone SE / iPhone 15 サイズで 装着開始→リロード復元・連打・手動追加/編集/削除・オフライン起動と記録・CSV 復元とカレンダー・横スクロールなし・44px タップ領域・axe によるアクセシビリティ (重大違反ゼロ) を確認。初回のみ `npx playwright install chromium`
- `npm run e2e` の `sync` プロジェクト: モックの Supabase (認証 + PostgREST、LWW/RLS 再現) に対して、実際の supabase-js でマジックリンクログイン → 2台の端末間の同期 → 削除が復活しない → オフライン復帰後の送信 → サーバー停止時のエラー表示 を確認 (`.env.e2e` で別ビルド)
- CI: `.github/workflows/ci.yml` が push / PR ごとに lint・test・build・e2e を実行

`npm test` — 目標履歴、CSV 書き出し→復元の往復・重複防止、押しまちがい防止、時間計算 (14時間目標・複数セッション・日付またぎ・達成/未達成・再装着の終了予定)、カレンダー集計・達成判定、入力検証、オフライン保存、outbox 同期・冪等性・LWW・論理削除・複数端末マージ。

## CT303 への引き継ぎ
`docs/HANDOFF.md` と `scripts/handoff.sh` を参照。

## 既知の制限 / 今後の改善
- 目標履歴の導入前に記録された日は、導入時点 (最初の変更前) の目標で判定
- PDF 出力、Web Push、複数の子どもの切り替えUI、グラフ画面は未実装
- 実 Supabase プロジェクト・実機 iOS/Android での確認は未実施
- 日付は Asia/Tokyo 固定
