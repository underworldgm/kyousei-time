#!/usr/bin/env bash
# クラウドの作業枠が尽きそうなときに、作業中の状態をローカル開発サーバー (CT303) へ引き継ぐ。
# 使い方: scripts/handoff.sh [ブランチ名]   (クラウド側で実行 → push まで行う)
# CT303 側: git fetch origin && git checkout <ブランチ> && npm ci && npm test && npm run dev
set -euo pipefail
branch="${1:-$(git rev-parse --abbrev-ref HEAD)}"
git add -A
if ! git diff --cached --quiet; then
  git commit -m "WIP: handoff to CT303" -m "docs/HANDOFF.md を参照"
fi
git push -u origin "$branch"
echo "pushed: $branch  → CT303 で: git fetch origin && git checkout $branch && npm ci && npm run dev"
