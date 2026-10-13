# アップロード指示書（Xサーバー）

公開アドレス: **https://eastone-data.hachimaru-80skip.com/**

この指示書のとおりにファイルを置けば、上のアドレスでログイン画面が出ます。

---

## 1. どこに置くか

ファイルはすべて、サブドメインの公開フォルダ **`eastone-data`** の中に置きます。

```
hachimaru-80skip.com          ← ドメインのフォルダ（触らない）
└─ public_html                ← 本体サイトの公開フォルダ（触らない）
   └─ eastone-data            ← ★ここ（このシステムの公開フォルダ）
```

ファイルマネージャーの上部の表示が、次のようになっていれば正しい場所です。

> hachimaru-80skip.com ＞ public_html ＞ **eastone-data**

### よくある間違い

| 間違い | 正しい形 |
| --- | --- |
| `public_html/eastone-data.hachimaru-80skip.com/` に置いた | フォルダ名は **`eastone-data`** だけ |
| `public_html/eastone-data/eastone-data-upload/` のように1段深い | zip を展開したフォルダの**中身**を `eastone-data` に直接置く |
| `public_html/` に直接置いた | 本体サイトと混ざります。`eastone-data` の中に置く |

置き場所は、サーバーパネル「サブドメイン設定」の一覧に出る「ドキュメントルート」が正です。通常は `/hachimaru-80skip.com/public_html/eastone-data/` です。違う表示の場合は、表示された場所に置いてください。

---

## 2. `eastone-data` の中身（完成形）

zip の中身をそのまま置くと、次の形になります。**★は必須**です。1つでも欠けると動きません。

```
eastone-data/
├─ ★ .htaccess              設定（https への転送、保護）
├─ ★ index.html             最初の画面
├─ ★ _next/                 画面の見た目と動き（28ファイル）
├─ ★ api/                   ログイン・データ保存（下の 3 を参照）
├─ ★ store/                 店舗ごとの画面（50ファイル）
├─ ★ staff/                 スタッフ画面（10ファイル）
├─ ★ caremanagers/          ケアマネ画面（5ファイル）
├─   404/  404.html  _not-found/   ページが無いときの画面
├─   favicon.ico            タブのアイコン
├─   robots.txt             検索エンジンに載せない設定
└─   index.txt  __next.__PAGE__.txt  __next._full.txt  __next._tree.txt
                            画面の切り替えを速くするファイル
```

- 名前が `_`（アンダーバー）や `.`（ドット）で始まるフォルダ・ファイルも、**必ず**アップロードしてください。特に `_next` と `.htaccess` は見落としやすいです。
- Xサーバーが最初に置いた `index.html`（「まだホームページがアップロードされていません」の画面）は、上書きして置き換えます。

---

## 3. `api` フォルダの中身

```
eastone-data/api/
├─ ★ .htaccess              設定ファイルを外から読めなくする（必須）
├─ ★ index.php              ログイン・データ保存の本体
├─ ★ lib.php                データベースの処理
├─ ★ report.php             月次報告の AI 文章作成
├─ ★ config.php             ★自分で作る（下の 4 を参照）
├─   config.sample.php      config.php の見本
├─   composer.json  composer.lock   ライブラリの一覧（動作には不要）
├─ ★ data/
│   └─ ★ .htaccess          データを外から読めなくする（必須）
└─   vendor/                AI 文章作成用のライブラリ（約3,600ファイル）
     ├─ .htaccess
     ├─ autoload.php
     └─ anthropic-ai/ composer/ guzzlehttp/ php-http/ psr/ ralouphie/ standard-webhooks/ symfony/
```

### `vendor` について
- ファイル数が多いため、**後回しで大丈夫です**。無くてもシステムは動き、月次報告は簡易テンプレートで作られます。
- アップロードは、ファイルマネージャーではなく **FTP ソフト（FileZilla など）** を使ってください。ファイルマネージャーだと途中で止まったり、取りこぼしたりしやすいです。
- FTP の接続情報は、サーバーパネル「FTPアカウント設定」で確認できます。

---

## 4. `config.php` の作り方（最初の1回だけ）

1. `api/config.sample.php` をパソコンにダウンロードします（zip の中の同じファイルでも可）。
2. メモ帳などで開き、次の4か所を書き換えます。

   ```php
   'password' => 'ログイン用のパスワード',

   'db' => [
       'driver' => 'mysql',
       'host' => 'MySQL のホスト名',        // サーバーパネル「MySQL設定」→「MySQL情報」に表示
       'name' => 'データベース名',          // 例: xxxxx_eastone
       'user' => 'MySQL ユーザー名',        // 例: xxxxx_eastone
       'pass' => 'MySQL ユーザーのパスワード',
   ],

   'anthropic_api_key' => '',              // AI を使うときだけキーを入れる（空欄のままで可）
   ```

3. 文字コード **UTF-8** で、名前を **`config.php`** にして保存します。
4. `eastone-data/api/` にアップロードします。

注意点:
- `'` （半角のシングルクォート）や `,`（カンマ）は消さないでください。
- MySQL のデータベースとユーザーは、サーバーパネル「MySQL設定」で先に作り、ユーザーにデータベースのアクセス権を付けておきます。

---

## 5. 置けたかの確認

ブラウザで次のアドレスを順に開きます（表示が変わらないときは Ctrl + F5 で再読み込み）。

| 開くアドレス | 正しい表示 | 違うときの原因 |
| --- | --- | --- |
| https://eastone-data.hachimaru-80skip.com/robots.txt | `User-agent: *` `Disallow: /` | 置き場所が違う（1 を確認） |
| https://eastone-data.hachimaru-80skip.com/api/index.php?action=me | `{"error":"ログインが必要です。"}` | 「config.php がありません」→ 4 を確認 / ファイルの中身がそのまま見える・真っ白 → PHP のバージョンを確認 |
| https://eastone-data.hachimaru-80skip.com/api/config.php | 「Forbidden」などのエラー（中身が見えない） | `api/.htaccess` が無い（3 を確認） |
| https://eastone-data.hachimaru-80skip.com/ | パスワード入力の画面 | 崩れた画面 → `_next` が無い（2 を確認） |

最後のアドレスで `config.php` に書いたパスワードを入れ、「店舗一覧」が出れば完了です。

ログイン後に「データベースに接続できません」と出た場合は、`config.php` の MySQL 情報（ホスト名・データベース名・ユーザー名・パスワード）と、ユーザーのアクセス権を確認してください。

---

## 6. チェックリスト

- [ ] サブドメイン `eastone-data` を追加した（無料独自SSL オン）
- [ ] PHP のバージョンを 8.2 以上にした（「PHP Ver.切替」）
- [ ] MySQL のデータベース・ユーザーを作り、アクセス権を付けた
- [ ] `public_html/eastone-data/` に zip の中身を置いた（1段深くなっていない）
- [ ] `.htaccess`、`_next/`、`api/` がある
- [ ] `api/config.php` を作ってアップロードした
- [ ] `api/.htaccess` と `api/data/.htaccess` がある
- [ ] （AI を使う場合）`api/vendor/` を FTP でアップロードした
- [ ] 5 の確認がすべて正しい表示になった

## 更新するとき

新しい zip を受け取ったら、中身を**すべて** `eastone-data` に**上書き**でアップロードします。

- **`_next` フォルダは削除しないでください。** 新しいファイルを追加するだけで大丈夫です。古いファイルが残っていても害はありません。
- **`index.html` などの画面のファイル（`.html` と `.txt`）が必ず上書きされていること**を確認してください。上書きの確認で「スキップ」を選ぶと古いまま残ります。古い画面のファイルだけが残ると、見た目が崩れて「確認中…」から進まなくなります。
- `api/config.php` は zip に入っていないので、上書きされません（消さないでください）。

### 更新できたかの確かめ方
1. ファイルマネージャーで `index.html` の「更新日時」が、アップロードした日時になっているか見る
2. ブラウザで Ctrl + F5（Mac は Command + Shift + R）を押して再読み込みする。変わらなければシークレットウィンドウで開く
