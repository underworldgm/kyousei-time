# きょうせいタイム 開発ルール

## 目的

子どもの歯科矯正器具の装着時間を記録するモバイル向けWebアプリです。
詳細な仕様、実装済み機能、確認項目は `CLAUDE.md` にまとまっています。作業前に必ず両方を読んでください。

## 構成

- `index.html`: 設定・時間・カレンダーの3画面
- `styles.css`: モバイル向けレイアウトとデザイン
- `app.js`: 設定、タイマー、一時停止・再開、通知、カレンダー、localStorage
- 外部ライブラリとビルド工程はありません。

## 作業ルール

- `main` に直接コミットしないでください。
- Codexの作業ブランチは `codex/<task>` を使ってください。
- Claude Codeの作業ブランチは `claude/<task>` を使ってください。
- 作業開始前に `git pull --ff-only` を実行してください。
- 既存のユーザー変更や別エージェントの変更を削除しないでください。
- 同じ機能をCodexとClaude Codeで同時に編集しないでください。
- 変更後は `node --check app.js` とブラウザ表示を確認してください。
- コミット後に作業ブランチをpushし、Pull Requestで `main` に統合してください。

## ct303の作業場所

- Codex: `dev` ユーザー、`/home/dev/kyousei-time`
- Claude Code: `root` ユーザー、`/root/kyousei-time`

各エージェントは自分の作業場所だけを編集してください。
