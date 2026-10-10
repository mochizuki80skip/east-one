#!/usr/bin/env bash
# データベースのバックアップ（毎日実行、30日分を保持）
# crontab -e で次の1行を追加: 30 3 * * * /home/eastone/east-one/deploy/backup.sh
set -euo pipefail
APP_DIR="/home/eastone/east-one"
DB="${DATABASE_PATH:-$APP_DIR/data/east-one.db}"
OUT="$APP_DIR/backups"
mkdir -p "$OUT"
sqlite3 "$DB" ".backup '$OUT/east-one-$(date +%Y%m%d).db'"
find "$OUT" -name 'east-one-*.db' -mtime +30 -delete
