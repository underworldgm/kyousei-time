# CT303 への引き継ぎ手順

クラウドのクレジットが尽きそうなときは、**未完成でも必ずコミット & push** して CT303 (ローカル開発サーバー) で続きを行います。

## クラウド側
```bash
scripts/handoff.sh            # 変更を WIP コミットして現在のブランチを push
```
その前に、下の「進捗メモ」を更新してください。

## CT303 側 (root, /root/kyousei-time)
```bash
git fetch origin && git checkout claude/kyosei-time-webapp-075i6a && git pull --ff-only
npm ci
cp -n .env.example .env     # Supabase を使う場合のみ値を設定
npm test && npm run lint
npm run dev                 # http://CT303:5173 (--host 済み)
```
Node 20 以上。`main` に直接コミットせず、`claude/<task>` ブランチ → PR で統合 (AGENTS.md 参照)。

## 進捗メモ (更新して引き継ぐ)
- 完了: React/TS/Vite 再構築、3画面UI、IndexedDB (Dexie)、時間計算、同期エンジン (outbox/LWW)、Supabase migration + RLS、PWA、通知、CSV、テスト
- 完了(2回目): CSV復元、目標時間の履歴 (migration 0003)、1分未満の押しまちがい破棄、320〜375px幅のレイアウト修正、本番ビルドでのリロード復元・オフライン動作の自動確認
- 完了(3回目): 自動検証の整備 — PGlite で SQL/RLS 検証、Playwright E2E (本番ビルド+SW、iPhone SE/15、axe)、モック Supabase で2端末同期 E2E、GitHub Actions CI。認証まわりの不具合修正 (ログイン監視の常駐化・ログアウト・アカウント切替時のデータ保護)、API を SW キャッシュ対象外に、丸ゴシック同梱、WCAG AA コントラスト
- 検証コマンド: `npm run lint && npm test && npm run e2e` (CT303 では初回 `npx playwright install --with-deps chromium`)
- 未実施: 実Supabaseプロジェクトでの結合確認、実機(iOS/Android)確認、PDF出力、Web Push、複数の子どもの切替UI
- 旧実装 (素のHTML/JS) は `legacy/` に残してあります。
