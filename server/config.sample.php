<?php
/**
 * East-one 業務サポート 設定ファイル
 * このファイルを config.php という名前でコピーして、値を書き換えてください。
 * （config.php はブラウザから読めないよう .htaccess で保護しています）
 */
return [
    // ログイン用のパスワード（推測されにくいものにしてください）
    'password' => 'ここにパスワードを入れる',

    // データベース（Xサーバーのサーバーパネル「MySQL設定」で作成したもの）
    'db' => [
        'driver' => 'mysql',
        'host' => 'localhost',
        'name' => 'xxxxx_eastone',   // MySQLデータベース名
        'user' => 'xxxxx_eastone',   // MySQLユーザー名
        'pass' => 'MySQLのパスワード',
    ],
    // MySQL を使わずファイル1つで動かす場合（動作確認用）は上を消して次を使う
    // 'db' => ['driver' => 'sqlite', 'path' => __DIR__ . '/data/east-one.sqlite'],

    // 月次報告の文章作成に使う Claude API キー（空欄なら簡易テンプレートで作成）
    'anthropic_api_key' => '',
    'model' => 'claude-opus-5',

    // ログインの有効時間（時間）
    'session_hours' => 12,
];
