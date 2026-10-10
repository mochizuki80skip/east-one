# XServer VPS への設置手順

このシステムは Node.js のサーバーを常時起動し、データを SQLite ファイルに保存します。
そのため、PHP や WordPress 向けの共用レンタルサーバーではなく、**XServer VPS**（Ubuntu）に置く前提の手順です。

## 0. 用意するもの

| 項目 | 内容 |
| --- | --- |
| サーバー | XServer VPS（メモリ 2GB 以上を推奨）。OS は Ubuntu 24.04 |
| ドメイン | Xserverドメインで取得（例: `eastone-hachimaru-80skip.com`） |
| AI のキー | 月次報告の文章作成に使う ANTHROPIC_API_KEY（任意） |

## 1. VPS とドメインの準備（管理画面）

1. XServer VPS を申し込み、OS に Ubuntu 24.04 を選ぶ。root パスワードか SSH キーを設定する
2. VPS パネルの「パケットフィルター設定」で SSH（22）・Web（80, 443）を許可する
3. Xserverドメインでドメインを取得し、DNS に A レコードを追加する  
   ホスト名: 空欄（ドメインそのもの） / 内容: VPS の IP アドレス

## 2. サーバーの初期設定（SSH で接続して実行）

```bash
# 必要なソフト
apt update && apt -y upgrade
apt -y install git nginx sqlite3 build-essential python3 certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt -y install nodejs

# アプリ用のユーザー
adduser --disabled-password --gecos "" eastone
```

## 3. アプリの設置

```bash
su - eastone
git clone https://github.com/mochizuki80skip/east-one.git
cd east-one
git checkout claude/zen-fermi-tec4ia   # 運用するブランチ（main にまとめた後は main）
cp .env.example .env
nano .env                    # APP_PASSWORD（必須）と ANTHROPIC_API_KEY を設定
npm ci
npm run build
exit
```

`.env` の例:

```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_PATH=/home/eastone/east-one/data/east-one.db
APP_PASSWORD=（推測されにくいパスワード）
APP_USER=eastone
```

## 4. 常時起動と Web 公開

```bash
cp /home/eastone/east-one/deploy/east-one.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now east-one
systemctl status east-one          # active (running) を確認

cp /home/eastone/east-one/deploy/nginx-east-one.conf /etc/nginx/sites-available/east-one
sed -i 's/DOMAIN/eastone-hachimaru-80skip.com/' /etc/nginx/sites-available/east-one   # 取得したドメインに置き換え
ln -s /etc/nginx/sites-available/east-one /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# HTTPS（無料証明書。自動更新される）
certbot --nginx -d eastone-hachimaru-80skip.com
```

ブラウザで `https://（ドメイン）` を開き、ユーザー名とパスワードを入れるとホーム画面が出れば完了です。

## 5. バックアップ

```bash
su - eastone
crontab -e
# 次の1行を追加（毎日 3:30 に data/ を backups/ へ保存、30日分保持）
30 3 * * * /home/eastone/east-one/deploy/backup.sh
```

VPS パネルの「自動バックアップ」も合わせて有効にしておくと安心です。

## 6. 更新するとき

```bash
su - eastone
cd east-one
git pull
npm ci
npm run build
exit
systemctl restart east-one
```

データベースの形式が変わる更新でも、起動時に自動で移行されます。念のため更新前に `deploy/backup.sh` を実行してください。
