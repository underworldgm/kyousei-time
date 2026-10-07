# きょうせいタイム

子どもの歯科矯正器具の装着時間を記録する、日本語・モバイル優先の PWA です。
**オフラインファースト**: すべての操作はまず IndexedDB に保存され、オンラインのときだけ Supabase と同期します。

> このアプリは医療診断を行うものではありません。目標時間は歯科医院の指示にしたがって保護者が設定します。

## 概要
- 画面: 設定 / 時間 / カレンダー (下部ナビ)
- 1日に複数回の着脱 (1回の装着 = 1 `WearSession`)、今日の合計・残り・終了予定、記録の追加/修正/論理削除
- 日付またぎ (Asia/Tokyo 基準で日別に分割集計)、連続達成、月間達成、7日/30日集計 (`rangeStats`)
- 達成スタンプ、達成演出 (`prefers-reduced-motion` 対応)、通知、CSV 書き出し

## 技術構成
React 18 + TypeScript + Vite / React Router / Dexie (IndexedDB) / vite-plugin-pwa (Workbox) / Supabase (Auth + PostgreSQL) / Vitest。
UI フレームワークは使わず CSS を自作。フォントは端末の丸ゴシック系 (Hiragino Maru Gothic, M PLUS Rounded 等) → システムフォントのフォールバックで、Webフォントへの外部依存はありません。

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

## Supabase / .env
1. `supabase/README.md` の手順で `migrations/0001_init.sql`, `0002_rls.sql` を実行
2. Email (Magic Link) を有効化し、Redirect URL にデプロイ先を追加
3. `.env`:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
service_role キー等の秘密鍵は絶対にコミットしないでください (`.env` は `.gitignore` 済み)。
RLS: 全テーブルで `user_id = auth.uid()` の行のみ読み書き可 (children も所有者で制限)。anon ロールは権限なし。

## 同期の仕組み
```
操作 → IndexedDB 即保存 (+ outbox に追加) → UI 即反映 → online なら push → pull
```
- outbox はレコード単位 (`table:id`)。送信後に `updatedAt` が変わっていなければ削除。送信中の編集は pending のまま残る。途中でブラウザが終了しても outbox から再送 (upsert なので冪等)。
- 復帰トリガー: `online` イベント / タブ復帰 / 60秒ごと / ローカル書き込み後 / エラー時の指数バックオフ。
- 競合は Last Write Wins (`updatedAt`)。サーバー側トリガーも古い更新を無視。pull はサーバー時刻 `synced_at` カーソルで端末時計のずれに強い。
- 削除は `deletedAt` の論理削除で、他端末で復活しない。装着記録は1回ごとの別レコードなので、2台での記録は上書きでなくマージされる。集計は区間を結合して二重計上を防ぐ。
- 新端末の未編集デフォルト (updatedAt=1970) はクラウドの保存済み設定を上書きしない。
- ログイン時 `local-user` のデータは自分のアカウントに引き継がれる。別アカウントでログインした場合は前のローカルデータを破棄。
- 表示: ✓同期済み / ↑同期待ち / ↻同期中 / !同期エラー / オフライン / この端末に保存。最終同期時刻と「クラウドにバックアップ済み」表示は設定画面。

## Offline 動作
アプリシェルは Service Worker で precache (Cache First)、Supabase API は Network First、データは IndexedDB First。`registerType: autoUpdate` + `skipWaiting/clientsClaim/cleanupOutdatedCaches` で古い版は残りません。アプリ起動・設定・装着開始/終了・カレンダー・過去記録はすべて圏外で動作します。

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
`npm run build` の `dist/` を Vercel / Cloudflare Pages / Netlify に配置 (SPA フォールバック: `vercel.json`, `public/_redirects` 同梱)。環境変数 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` を設定。Supabase の Redirect URL にデプロイ先を追加。

## テスト
`npm test` — 時間計算 (14時間目標・複数セッション・日付またぎ・達成/未達成・再装着の終了予定)、カレンダー集計・達成判定、入力検証、オフライン保存、outbox 同期・冪等性・LWW・論理削除・複数端末マージ。

## CT303 への引き継ぎ
`docs/HANDOFF.md` と `scripts/handoff.sh` を参照。

## 既知の制限 / 今後の改善
- 過去日の達成判定は「現在の目標時間」で行う (目標の履歴は未保存)
- CSV インポート、PDF 出力、Web Push、複数の子どもの切り替えUI、グラフ画面は未実装
- 実 Supabase プロジェクト・実機 iOS/Android での確認は未実施
- 日付は Asia/Tokyo 固定
