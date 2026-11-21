# East-one ホームページ（Xサーバーへの設置手順）

機能訓練型デイサービス East-one の公式ホームページです。
このリポジトリの業務システム（`eastone-data` サブドメイン）とは別のサイトで、ファイルはこの `homepage/` フォルダの中だけにまとまっています。

作業前に `CLAUDE.md`（守ること）と `HANDOFF.md`（経緯・事業所データ・残タスク）を読んでください。

## フォルダの中身

```
homepage/
  public_html/            ← サーバーに置くファイル一式（この中身をアップロード）
    index.html            トップページ（CSS・JSを内包）
    juyojiko.html         重要事項・運営規程／処遇改善／運営推進会議 議事録
    privacy.html          プライバシーポリシー（アクセス解析の説明を含む）
    404.html              ページが見つからないときの表示
    sub.css               下層ページ共通のスタイル
    analytics.js          アクセス解析（GA4・Clarity）。ID はこのファイルの先頭に入れる
    .htaccess             https への転送・圧縮・キャッシュなどのサーバー設定
    robots.txt / sitemap.xml   検索エンジン向け
    favicon.ico / icon-192.png / apple-touch-icon.png   ブラウザ・スマホのアイコン
    images/               画像一式（ogp.jpg は SNS で共有したときのサムネイル）
  build_preview.py        確認用の1枚ファイルを preview/ に作る（画像を埋め込み）
  tools/package.py        アップロード用一式を dist/ に作る
  tools/make_icons.py     アイコンと OGP 画像を作り直す（ロゴ・写真を変えたときだけ）
```

`preview/` と `dist/` は作業用に作られるフォルダで、Git には入りません。

公開アドレス：**https://east-one.hachimaru-80skip.com/**
（業務システムと同じ `hachimaru-80skip.com` のサブドメイン `east-one` に置きます）

## 1. アップロード用の一式を作る

```bash
cd homepage
python3 tools/package.py
```

`dist/public_html/` と、同じ中身の `dist/eastone-homepage.zip` ができます。
未記入の箇所や計測IDの入れ忘れがあると「注意」が表示されます。
（`public_html/` をそのままアップロードしても動きます。`package.py` は確認と zip づくりのためのものです）

## 2. Xサーバーのサーバーパネルでの準備

1. 「サブドメイン設定」で `hachimaru-80skip.com` を選び、「サブドメイン設定追加」でサブドメイン名に `east-one` を入力して追加します。「無料独自SSLを利用する」にチェックを入れたままにします。
2. 追加後の一覧に出る**ドキュメントルート**（公開フォルダ）を控えます。通常は `/hachimaru-80skip.com/public_html/east-one/` です。中に Xサーバーが置いた仮の `index.html` があるので、アップロード時に上書きします。
3. **SSL が有効になるまで待ちます**（数十分〜1時間ほど）。`.htaccess` は http を https に転送するので、SSL が有効になる前にアップロードすると表示されません。ブラウザで `https://east-one.hachimaru-80skip.com/` を開き、Xサーバーの仮ページが鍵マーク付きで表示されれば準備完了です。

> サブドメインのフォルダは親ドメインの `public_html` の中にあるため、`https://hachimaru-80skip.com/east-one/` でも同じファイルが見えてしまいます。`.htaccess` でこのアクセスを `https://east-one.hachimaru-80skip.com/` に転送しているので、検索エンジン上で二重になることはありません。
> 業務システム（`eastone-data`）のフォルダとは別なので、お互いに影響しません。

## 3. アップロード

どちらか一方で行います。

**A. FTP ソフト（FileZilla など）を使う（おすすめ）**

1. サーバーパネルの「FTPアカウント設定」に出ているホスト名・ユーザー名・パスワードで接続します。
2. `/hachimaru-80skip.com/public_html/east-one/` を開きます。
3. パソコン側で `dist/public_html/` を開き、**中身をすべて**（`.htaccess` を含む）ドラッグしてアップロードします。

`.htaccess` は名前が「.」で始まるため、パソコンで表示されないことがあります。FileZilla ではメニューの「サーバー」→「隠しファイルを強制的に表示」をオンにすると確認できます。

**B. サーバーパネルの「ファイル管理」を使う**

1. 「ファイル管理」で `/hachimaru-80skip.com/public_html/east-one/` を開きます。
2. `dist/eastone-homepage.zip` をアップロードし、ファイルを選んで「展開」します（展開機能が見当たらない場合は A の方法で）。
3. 展開後、zip ファイルは削除します。

## 4. 公開後の確認

- [ ] `https://east-one.hachimaru-80skip.com/` が表示される。`http://` で開いても `https://` に切り替わる
- [ ] `https://hachimaru-80skip.com/east-one/` で開くと、上のアドレスに切り替わる
- [ ] スマホで表示が崩れない。電話番号をタップすると発信画面になる
- [ ] フッターの「重要事項・運営規程」「プライバシーポリシー」が開く
- [ ] `https://east-one.hachimaru-80skip.com/aaa` のような存在しないアドレスで「ページが見つかりません」が出る
- [ ] LINE の共有などでサムネイル画像が出る（Facebook の「シェアデバッガー」でも確認できます）

## 5. 旧サイト（breamseastone.com）からの転送

旧サイトを見に来た人と検索エンジンの評価を新しいサイトへ引き継ぐため、旧ドメインに「301 リダイレクト（恒久的な転送）」を設定します。旧ドメインがどこのサーバーにあるかで方法が変わります。

**旧ドメインも Xサーバーに追加できる場合**：旧ドメインを「ドメイン設定」で追加し、その `public_html/` に次の内容の `.htaccess` だけを置きます。

```apache
RewriteEngine On
# 旧サイトのどのページに来ても、新しいサイトのトップへ
RewriteRule ^(.*)$ https://east-one.hachimaru-80skip.com/ [R=301,L]
```

**旧サイトがホームページ作成サービス（Wix・Jimdo など）の場合**：そのサービスの管理画面でドメインの接続を外し、ドメイン自体を Xサーバーに向けたうえで上の方法を使うのが確実です。ドメインの契約が切れると転送もできなくなるので、旧ドメインは少なくとも1年は更新を続けてください。

あわせて次の登録先のアドレスも新しいものに変えます。

- 介護サービス情報公表システム（3店舗分）
- Googleビジネスプロフィール（3店舗分）
- 公式LINE・Instagram のプロフィール欄
- 各市町・地域包括支援センターなどに配っている資料

## 6. アクセス解析（GA4・Microsoft Clarity）を入れる

計測コードは `public_html/analytics.js` にまとめてあり、全ページが読み込んでいます。
先頭の2行に ID を入れて、`analytics.js` だけアップロードし直せば計測が始まります。ID が空のあいだは何も読み込まず、何も送信しません。

```js
var EASTONE_GA4_ID = '';      // 例: 'G-XXXXXXXXXX'
var EASTONE_CLARITY_ID = '';  // 例: 'abcd123456'
```

ID の取り方、GA4 で最初にやる設定、クリック率や問い合わせ率の見方、チラシ・LINE からの訪問を見分ける方法は [docs/analytics.md](docs/analytics.md) にまとめています。

## 7. 公開後に Google に知らせる

1. Google Search Console に `https://east-one.hachimaru-80skip.com/` を「URLプレフィックス」で登録（確認用の HTML ファイルを `east-one/` フォルダに置く方法が簡単。親ドメインごと「ドメイン」方式で登録済みならそのままで可）
2. 「サイトマップ」に `sitemap.xml` を送信

## 見た目の確認（作業する人向け）

```bash
cd homepage
python3 build_preview.py
```

`preview/` に画像を埋め込んだ確認用ファイルができます。ブラウザで開けば、サーバーに上げなくても見た目を確認できます。
