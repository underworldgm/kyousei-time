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
- 完了: React/TS/Vite 再構築、3画面UI、IndexedDB (Dexie)、時間計算、同期エンジン (outbox/LWW)、Supabase migration + RLS、PWA、通知、CSV、テスト(36件)
- 未実施: 実Supabaseプロジェクトでの結合確認、実機(iOS/Android)確認、CSVインポート、PDF出力、Web Push
- 旧実装 (素のHTML/JS) は `legacy/` に残してあります。
