#!/usr/bin/env bash
# Xサーバー（レンタルサーバー）にアップロードするファイル一式を作る。
#   dist/public_html/ … この中身を、ドメインの public_html にそのままアップロードする
#   dist/east-one-xserver.zip … 同じ内容の zip（ファイルマネージャーでアップロード→展開する場合）
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▶ 画面（静的ファイル）を書き出し中…"
rm -rf out
npm run build >/dev/null

echo "▶ PHP（/api）を準備中…"
rm -rf dist
mkdir -p dist/public_html
cp -R out/. dist/public_html/
cp deploy/xserver/htaccess-root dist/public_html/.htaccess
mkdir -p dist/public_html/api/data
cp server/index.php server/lib.php server/report.php server/config.sample.php server/composer.json dist/public_html/api/
[ -f server/composer.lock ] && cp server/composer.lock dist/public_html/api/
cp server/.htaccess dist/public_html/api/.htaccess
cp server/data/.htaccess dist/public_html/api/data/.htaccess
(cd dist/public_html/api && composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction --quiet)
# 動作に不要なもの（テスト・資料・git 履歴）を除いて軽くする
find dist/public_html/api/vendor -depth \( -name .git -o -name .github -o -name tests -o -name test -o -name docs -o -name examples -o -name fixtures \) -type d -exec rm -rf {} +
find dist/public_html/api/vendor -type f \( -name '*.md' -o -name 'phpunit*.xml*' -o -name '.gitattributes' -o -name '.gitignore' \) -delete
# vendor/ を直接読ませない
cp server/data/.htaccess dist/public_html/api/vendor/.htaccess

echo "▶ zip を作成中…"
(cd dist/public_html && zip -qr ../east-one-xserver.zip .)
du -sh dist/public_html dist/east-one-xserver.zip
echo "✔ 完了: dist/public_html の中身（または dist/east-one-xserver.zip）を"
echo "  /hachimaru-80skip.com/public_html/eastone-data/ にアップロードしてください。"
echo "  初回のみ: api/config.sample.php を api/config.php にコピーして設定します。"
