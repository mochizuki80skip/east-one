#!/usr/bin/env bash
# 手元で Xサーバーと同じ構成（静的ファイル＋PHP）で動かして確認する。
#   npm run preview            … 書き出してから起動
#   npm run preview -- --no-build … 書き出し済みのものをそのまま起動
# パスワードは preview（データは dist/public_html/api/data/preview.sqlite）
set -euo pipefail
cd "$(dirname "$0")/.."
[ "${1:-}" = "--no-build" ] || bash scripts/package.sh
CONF=dist/public_html/api/config.php
if [ ! -f "$CONF" ]; then
  cat > "$CONF" <<'PHP'
<?php return ['password' => 'preview', 'db' => ['driver' => 'sqlite', 'path' => __DIR__ . '/data/preview.sqlite'], 'anthropic_api_key' => getenv('ANTHROPIC_API_KEY') ?: '', 'model' => 'claude-opus-5', 'session_hours' => 12];
PHP
fi
echo "▶ http://localhost:8080 を開いてください（パスワード: preview）"
php -S 127.0.0.1:8080 -t dist/public_html
