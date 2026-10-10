# Xサーバー（レンタルサーバー）への設置手順

このシステムは、Xサーバーのレンタルサーバーでそのまま動く構成です。

公開アドレス: **https://eastone-data.hachimaru-80skip.com/**
（ドメイン hachimaru-80skip.com のサブドメイン `eastone-data` に置きます）

| 部分 | 中身 | 置き場所 |
| --- | --- | --- |
| 画面と自動作成の計算 | 静的ファイル（HTML / JavaScript / CSS） | サブドメインの公開フォルダ |
| データの保存・ログイン・AI の文章作成 | PHP | 公開フォルダの `api/` |
| データ | MySQL | サーバーパネルで作成 |

Node.js やコマンド操作は不要です。必要なのは、サーバーパネルでの設定とファイルのアップロードだけです。

## 1. アップロードするファイルを用意する

開発用のパソコン（Node.js 22 以上・PHP・Composer が入ったもの）で次を実行します。

```bash
npm install
npm run package
```

`dist/public_html/` フォルダ（と同じ中身の `dist/east-one-xserver.zip`）ができます。これがアップロードする一式です。

## 2. サーバーパネルでの準備

1. **ドメインを追加する**: 「ドメイン設定」に `hachimaru-80skip.com` が入っていなければ追加します。
2. **サブドメインを追加する**: 「サブドメイン設定」で `hachimaru-80skip.com` を選び、サブドメイン名に `eastone-data` を入力して追加します。「無料独自SSLを利用する」にチェックを入れたままにします。
   - 追加後の一覧に出る**ドキュメントルート**（公開フォルダ）を控えます。通常は `/hachimaru-80skip.com/public_html/eastone-data/` です
   - SSL が使えるようになるまで、数十分〜1時間ほどかかることがあります
3. **PHP のバージョンを選ぶ**: 「PHP Ver.切替」で `hachimaru-80skip.com` を **PHP 8.2 以上**（8.3 推奨）にします（サブドメインにも同じ設定が使われます）。
4. **MySQL を作る**: 「MySQL設定」で次の 3 つを行います。
   - 「MySQL追加」でデータベースを作る（例: `xxxxx_eastone`）
   - 「MySQLユーザ追加」でユーザーとパスワードを作る
   - 作ったデータベースの「アクセス権所有ユーザ」にそのユーザーを追加する
   - 「MySQL一覧」に出るホスト名を控えておく

## 3. 設定ファイルを作る

`dist/public_html/api/config.sample.php` をコピーして、同じフォルダに `config.php` という名前で保存します。中身を書き換えてください。

```php
'password' => 'ログイン用のパスワード（長く、推測されにくいもの）',
'db' => [
    'driver' => 'mysql',
    'host' => 'MySQL一覧に出ているホスト名',
    'name' => 'xxxxx_eastone',
    'user' => 'xxxxx_eastone',
    'pass' => 'MySQLユーザーのパスワード',
],
'anthropic_api_key' => '月次報告をAIで作る場合のキー（空欄でも動きます）',
```

`config.php` はブラウザからは読めないよう、`.htaccess` で保護しています。

## 4. アップロード

FTP ソフト（FileZilla など）でサーバーに接続し、`dist/public_html/` の**中身**を、サブドメインの公開フォルダにアップロードします。

- アップロード先: `/hachimaru-80skip.com/public_html/eastone-data/`（手順 2 で控えたドキュメントルート）
- `.htaccess` のように名前が「.」で始まるファイルもアップロードしてください（FileZilla は「サーバー → 隠しファイルを強制表示」）
- 最初から入っている `index.html`（Xサーバーの初期ページ）は上書きされます

SSH を使える場合は、zip をアップロードして `unzip east-one-xserver.zip` で展開しても同じです。

## 5. 動作確認

1. `https://eastone-data.hachimaru-80skip.com/` を開き、`config.php` のパスワードでログインする
2. 店舗一覧で店舗（本店・三島店・長泉店）を追加する
3. 「スタッフ」「ケアマネ」「店舗設定」「曜日別利用者」の順に登録する

データベースの表は、初めてログインしたときに自動で作られます。

## 更新するとき

```bash
git pull
npm run package
```

`dist/public_html/` をもう一度アップロードします。`api/config.php` は一式に含まれないので、上書きされません。

## バックアップ

- サーバーパネルの「バックアップ」から、Web ファイルと MySQL を過去の日付に戻せます
- 手動で残す場合は、「phpMyAdmin」でデータベースをエクスポートしてください（テーブルは `eo_docs` と `eo_counters` の 2 つだけです）

## うまく動かないとき

| 症状 | 確認すること |
| --- | --- |
| ログイン画面で「config.php がありません」 | `api/config.php` をアップロードしたか |
| 「データベースに接続できません」 | `config.php` のホスト名・DB名・ユーザー名・パスワード、アクセス権の設定 |
| 「パスワードを設定してください」 | `config.php` の `password` を書き換えたか |
| 画面が真っ白・500 エラー | PHP のバージョンが 8.2 以上か、`.htaccess` がアップロードされているか |
| AI の文章作成が失敗する | `anthropic_api_key`、`api/vendor/` フォルダがアップロードされているか |
| 「保護されていない通信」と出る・https で開けない | サブドメインの無料独自SSLが有効になるまで待つ（最大1時間ほど） |
| 本体の hachimaru-80skip.com に設定したアクセス制限がかかる | 本体の `public_html/.htaccess` の設定はサブドメインのフォルダにも効きます。必要ならサブドメイン側で上書きします |

社内システムのため、検索エンジンには載らない設定（robots.txt と noindex）にしています。
