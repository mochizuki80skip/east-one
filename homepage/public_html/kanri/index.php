<?php
/**
 * East-one ホームページ 資料の管理画面（運営推進会議の議事録など）
 *
 * - パスワードでログイン（パスワードは同じフォルダの config.php に書く）
 * - PDF / Excel / Word のファイルを登録するか、Google スプレッドシート・ドキュメントの共有リンクを登録する
 * - 登録した資料は、公開ページ documents.html に自動で並ぶ
 *
 * データの置き場所
 *   kanri/data/documents.json … すべての資料（非公開のものも含む）。ブラウザからは読めない
 *   files/                    … アップロードしたファイル
 *   files/documents.json      … 公開中の資料だけの一覧。documents.html が読み込む
 */
declare(strict_types=1);

const CATEGORIES = [
    'suishin_honten'    => '運営推進会議 議事録（本店）',
    'suishin_nagaizumi' => '運営推進会議 議事録（長泉店）',
    'juyo'              => '重要事項説明書・運営規程',
    'shogu'             => '処遇改善（職場環境等要件）',
];
/** 受け付けるファイル：拡張子 => [種類の表示名, 中身として認める MIME] */
const FILE_TYPES = [
    'pdf'  => ['PDF',   ['application/pdf']],
    'xlsx' => ['Excel', ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream']],
    'xls'  => ['Excel', ['application/vnd.ms-excel', 'application/x-ole-storage', 'application/CDFV2', 'application/octet-stream']],
    'docx' => ['Word',  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream']],
    'doc'  => ['Word',  ['application/msword', 'application/x-ole-storage', 'application/CDFV2', 'application/octet-stream']],
];
const MAX_BYTES = 20 * 1024 * 1024;
const LOGIN_LIMIT = 5;          // この回数まちがえたら
const LOGIN_LOCK_SEC = 15 * 60; // この時間ログインできなくする

$ROOT = dirname(__DIR__);
$DATA_DIR = __DIR__ . '/data';
$FILES_DIR = $ROOT . '/files';
$DB_FILE = $DATA_DIR . '/documents.json';
$PUBLIC_FILE = $FILES_DIR . '/documents.json';
$LOCK_FILE = $DATA_DIR . '/login-failures.json';

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');

// ---------------- 設定 ----------------
$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    page_start('設定が必要です');
    echo '<div class="box err"><p><b>config.php がありません。</b></p><p>サーバーの <code>kanri</code> フォルダにある <code>config.sample.php</code> をコピーして <code>config.php</code> という名前にし、中のパスワードを書き換えてください。</p></div>';
    page_end();
}
$config = require $configFile;
$password = (string)($config['password'] ?? '');
if ($password === '' || $password === 'ここにパスワードを入れる' || mb_strlen($password) < 10) {
    page_start('設定が必要です');
    echo '<div class="box err"><p><b>パスワードが設定されていません。</b></p><p><code>kanri/config.php</code> の password を、10文字以上の推測されにくいものに書き換えてください。</p></div>';
    page_end();
}

foreach ([$DATA_DIR, $FILES_DIR] as $d) {
    if (!is_dir($d)) @mkdir($d, 0755, true);
}

// ---------------- ログイン ----------------
session_name('EASTONEKANRI');
session_set_cookie_params([
    'lifetime' => 0, 'path' => dirname($_SERVER['SCRIPT_NAME']) . '/',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true, 'samesite' => 'Strict',
]);
session_start();
$hours = (int)($config['session_hours'] ?? 8);
if (!empty($_SESSION['login_at']) && time() - (int)$_SESSION['login_at'] > $hours * 3600) {
    $_SESSION = [];
}
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));

$action = $_POST['action'] ?? '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !hash_equals($_SESSION['csrf'], (string)($_POST['csrf'] ?? ''))) {
    flash('画面の有効期限が切れました。もう一度操作してください。', true);
    redirect();
}

if ($action === 'logout') {
    $_SESSION = [];
    session_regenerate_id(true);
    redirect();
}

if ($action === 'login') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $fails = read_json($LOCK_FILE);
    $mine = array_values(array_filter($fails[$ip] ?? [], fn($t) => $t > time() - LOGIN_LOCK_SEC));
    if (count($mine) >= LOGIN_LIMIT) {
        flash('パスワードを続けてまちがえたため、15分間ログインできません。', true);
        redirect();
    }
    if (hash_equals($password, (string)($_POST['password'] ?? ''))) {
        unset($fails[$ip]);
        write_json($LOCK_FILE, $fails);
        session_regenerate_id(true);
        $_SESSION['login_at'] = time();
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
        redirect();
    }
    $mine[] = time();
    $fails[$ip] = $mine;
    write_json($LOCK_FILE, $fails);
    usleep(500000);
    flash('パスワードがちがいます。', true);
    redirect();
}

if (empty($_SESSION['login_at'])) {
    page_start('ログイン');
    show_flash();
    echo '<form method="post" class="box login"><input type="hidden" name="action" value="login">' . csrf_field() .
        '<label>パスワード<input type="password" name="password" autocomplete="current-password" required autofocus></label>' .
        '<button type="submit" class="btn">ログイン</button></form>';
    page_end();
}

// ---------------- ここからログイン後 ----------------
$docs = read_json($DB_FILE);

if ($action === 'add') {
    $cat = (string)($_POST['category'] ?? '');
    $title = trim((string)($_POST['title'] ?? ''));
    $date = (string)($_POST['date'] ?? '');
    $source = (string)($_POST['source'] ?? 'file');
    $errors = [];
    if (!isset(CATEGORIES[$cat])) $errors[] = '種類を選んでください。';
    if ($title === '' || mb_strlen($title) > 80) $errors[] = 'タイトルを80文字以内で入れてください。';
    if (!valid_date($date)) $errors[] = '日付を選んでください。';

    $doc = ['id' => bin2hex(random_bytes(6)), 'category' => $cat, 'title' => $title, 'date' => $date,
            'published' => true, 'created_at' => date('Y-m-d H:i:s')];

    if (!$errors && $source === 'google') {
        $url = trim((string)($_POST['url'] ?? ''));
        $type = google_type($url);
        if ($type === null) {
            $errors[] = 'Google スプレッドシート・ドキュメントの共有リンク（https://docs.google.com/… または https://drive.google.com/…）を貼り付けてください。';
        } else {
            $doc += ['kind' => 'google', 'url' => $url, 'type' => $type];
        }
    } elseif (!$errors) {
        $f = $_FILES['file'] ?? null;
        $err = upload_error($f);
        if ($err) {
            $errors[] = $err;
        } else {
            $ext = strtolower(pathinfo((string)$f['name'], PATHINFO_EXTENSION));
            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) ?: '';
            if (!isset(FILE_TYPES[$ext])) {
                $errors[] = '登録できるのは PDF・Excel（xlsx / xls）・Word（docx / doc）です。';
            } elseif (!in_array($mime, FILE_TYPES[$ext][1], true)) {
                $errors[] = 'ファイルの中身が拡張子と合っていません（' . h($mime) . '）。保存し直してから登録してください。';
            } else {
                $name = str_replace('-', '', $date) . '-' . bin2hex(random_bytes(5)) . '.' . $ext;
                if (!move_uploaded_file($f['tmp_name'], $FILES_DIR . '/' . $name)) {
                    $errors[] = 'ファイルを保存できませんでした。サーバーの files フォルダの書き込み権限を確認してください。';
                } else {
                    @chmod($FILES_DIR . '/' . $name, 0644);
                    $doc += ['kind' => 'file', 'file' => $name, 'type' => FILE_TYPES[$ext][0],
                             'size' => (int)$f['size'], 'original_name' => mb_substr((string)$f['name'], 0, 120)];
                }
            }
        }
    }
    if ($errors) {
        flash(implode("\n", $errors), true);
        $_SESSION['form'] = ['category' => $cat, 'title' => $title, 'date' => $date, 'source' => $source];
        redirect();
    }
    $docs[] = $doc;
    save_all($docs);
    flash('「' . $title . '」を登録しました。公開ページに表示されています。');
    redirect();
}

if ($action === 'update' || $action === 'toggle' || $action === 'delete') {
    $id = (string)($_POST['id'] ?? '');
    $i = find_index($docs, $id);
    if ($i === null) {
        flash('対象の資料が見つかりません。', true);
        redirect();
    }
    if ($action === 'toggle') {
        $docs[$i]['published'] = empty($docs[$i]['published']);
        flash('「' . $docs[$i]['title'] . '」を' . ($docs[$i]['published'] ? '公開' : '非公開') . 'にしました。');
    } elseif ($action === 'delete') {
        $d = $docs[$i];
        if (($d['kind'] ?? '') === 'file' && preg_match('/^[0-9a-f\-]+\.(pdf|xlsx|xls|docx|doc)$/', (string)$d['file'])) {
            @unlink($FILES_DIR . '/' . $d['file']);
        }
        array_splice($docs, $i, 1);
        flash('「' . $d['title'] . '」を削除しました。');
    } else {
        $title = trim((string)($_POST['title'] ?? ''));
        $date = (string)($_POST['date'] ?? '');
        $cat = (string)($_POST['category'] ?? '');
        if ($title === '' || mb_strlen($title) > 80 || !valid_date($date) || !isset(CATEGORIES[$cat])) {
            flash('タイトル（80文字以内）・日付・種類を確認してください。', true);
            redirect();
        }
        $docs[$i]['title'] = $title;
        $docs[$i]['date'] = $date;
        $docs[$i]['category'] = $cat;
        flash('「' . $title . '」を更新しました。');
    }
    save_all($docs);
    redirect();
}

// ---------------- 画面 ----------------
$form = $_SESSION['form'] ?? [];
unset($_SESSION['form']);
page_start('資料の管理');
echo '<form method="post" class="logout"><input type="hidden" name="action" value="logout">' . csrf_field() . '<button type="submit" class="link">ログアウト</button></form>';
show_flash();

echo '<section class="box"><h2>資料を追加する</h2>
<form method="post" enctype="multipart/form-data" class="add">
<input type="hidden" name="action" value="add">' . csrf_field() . '
<label>種類<select name="category" required><option value="">選んでください</option>';
foreach (CATEGORIES as $k => $v) {
    echo '<option value="' . h($k) . '"' . (($form['category'] ?? '') === $k ? ' selected' : '') . '>' . h($v) . '</option>';
}
echo '</select></label>
<label>タイトル（ホームページに表示されます）<input type="text" name="title" maxlength="80" required placeholder="例：2026年度 第2回 運営推進会議 議事録" value="' . h($form['title'] ?? '') . '"></label>
<label>日付（開催日・作成日など）<input type="date" name="date" required value="' . h($form['date'] ?? date('Y-m-d')) . '"></label>
<fieldset><legend>登録のしかた</legend>
<label class="radio"><input type="radio" name="source" value="file"' . (($form['source'] ?? 'file') === 'file' ? ' checked' : '') . '> ファイルを選ぶ（PDF・Excel・Word）</label>
<label class="radio"><input type="radio" name="source" value="google"' . (($form['source'] ?? '') === 'google' ? ' checked' : '') . '> Google スプレッドシート・ドキュメントのリンクを貼る</label>
</fieldset>
<div class="src src-file"><input type="file" name="file" accept=".pdf,.xlsx,.xls,.docx,.doc">
<p class="hint">20MBまで。ご家族がスマホで開きやすいのは PDF です。Excel・Word はスマホではダウンロードになります。</p></div>
<div class="src src-google"><input type="url" name="url" placeholder="https://docs.google.com/…">
<p class="hint">Google 側の共有設定を「リンクを知っている全員（閲覧者）」にしてください。そうしないと、見る人に「アクセス権が必要です」と表示されます。</p></div>
<button type="submit" class="btn">登録する</button>
<p class="hint">個人名など、公開してはいけない情報が入っていないか確認してから登録してください。</p>
</form></section>';

echo '<section class="box"><h2>登録済みの資料</h2>';
if (!$docs) echo '<p>まだ登録されていません。</p>';
foreach (CATEGORIES as $k => $label) {
    $list = array_values(array_filter($docs, fn($d) => $d['category'] === $k));
    if (!$list) continue;
    usort($list, fn($a, $b) => strcmp($b['date'], $a['date']));
    echo '<h3>' . h($label) . '</h3><ul class="docs">';
    foreach ($list as $d) {
        $href = $d['kind'] === 'file' ? '../files/' . rawurlencode($d['file']) : $d['url'];
        echo '<li class="' . (empty($d['published']) ? 'hidden' : '') . '">
<div class="meta"><span class="type">' . h($d['type']) . '</span>' . (empty($d['published']) ? '<span class="off">非公開</span>' : '') .
            ' <a href="' . h($href) . '" target="_blank" rel="noopener">' . h($d['title']) . '</a> <small>' . h($d['date']) . '</small></div>
<details><summary>編集・非公開・削除</summary>
<form method="post" class="edit"><input type="hidden" name="action" value="update"><input type="hidden" name="id" value="' . h($d['id']) . '">' . csrf_field() . '
<label>種類<select name="category">';
        foreach (CATEGORIES as $kk => $vv) echo '<option value="' . h($kk) . '"' . ($kk === $d['category'] ? ' selected' : '') . '>' . h($vv) . '</option>';
        echo '</select></label>
<label>タイトル<input type="text" name="title" maxlength="80" value="' . h($d['title']) . '"></label>
<label>日付<input type="date" name="date" value="' . h($d['date']) . '"></label>
<button type="submit" class="btn small">変更を保存</button></form>
<div class="row">
<form method="post"><input type="hidden" name="action" value="toggle"><input type="hidden" name="id" value="' . h($d['id']) . '">' . csrf_field() .
            '<button type="submit" class="btn small ghost">' . (empty($d['published']) ? '公開する' : '非公開にする') . '</button></form>
<form method="post" onsubmit="return confirm(\'「' . h(addslashes($d['title'])) . '」を削除します。元に戻せません。よろしいですか？\')"><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="' . h($d['id']) . '">' . csrf_field() .
            '<button type="submit" class="btn small danger">削除する</button></form>
</div></details></li>';
    }
    echo '</ul>';
}
echo '<p class="hint">公開ページ：<a href="../documents.html" target="_blank" rel="noopener">documents.html</a>（新しい日付が上に並びます）</p></section>';
page_end();

// ---------------- 関数 ----------------
function h(?string $s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

function csrf_field(): string { return '<input type="hidden" name="csrf" value="' . h($_SESSION['csrf'] ?? '') . '">'; }

function redirect(): never
{
    header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'), true, 303);
    exit;
}

function flash(string $msg, bool $error = false): void { $_SESSION['flash'] = [$msg, $error]; }

function show_flash(): void
{
    if (empty($_SESSION['flash'])) return;
    [$msg, $err] = $_SESSION['flash'];
    unset($_SESSION['flash']);
    echo '<div class="box ' . ($err ? 'err' : 'ok') . '">' . nl2br(h($msg)) . '</div>';
}

function read_json(string $file): array
{
    if (!is_file($file)) return [];
    $data = json_decode((string)file_get_contents($file), true);
    return is_array($data) ? $data : [];
}

function write_json(string $file, array $data): void
{
    $tmp = $file . '.tmp' . bin2hex(random_bytes(3));
    file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX);
    @chmod($tmp, 0644);
    rename($tmp, $file);
}

/** 全件（管理用）と、公開中のものだけ（ホームページ用）の2つを書き出す */
function save_all(array $docs): void
{
    global $DB_FILE, $PUBLIC_FILE;
    write_json($DB_FILE, array_values($docs));
    $pub = [];
    foreach ($docs as $d) {
        if (empty($d['published'])) continue;
        $pub[] = [
            'category' => $d['category'], 'title' => $d['title'], 'date' => $d['date'], 'type' => $d['type'],
            'url' => $d['kind'] === 'file' ? 'files/' . rawurlencode($d['file']) : $d['url'],
            'size' => $d['size'] ?? null,
        ];
    }
    usort($pub, fn($a, $b) => strcmp($b['date'], $a['date']));
    write_json($PUBLIC_FILE, ['updated' => date('Y-m-d H:i'), 'categories' => CATEGORIES, 'documents' => $pub]);
}

function find_index(array $docs, string $id): ?int
{
    foreach ($docs as $i => $d) if (($d['id'] ?? '') === $id) return $i;
    return null;
}

function valid_date(string $d): bool
{
    $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $d);
    return $dt !== false && $dt->format('Y-m-d') === $d;
}

function google_type(string $url): ?string
{
    if (!preg_match('#^https://(docs|drive)\.google\.com/[\w\-./?=&%\#]+$#', $url)) return null;
    if (str_contains($url, '/spreadsheets/')) return 'Googleスプレッドシート';
    if (str_contains($url, '/document/')) return 'Googleドキュメント';
    if (str_contains($url, '/presentation/')) return 'Googleスライド';
    return 'Googleドライブ';
}

function upload_error(?array $f): ?string
{
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return 'ファイルを選んでください。';
    switch ($f['error']) {
        case UPLOAD_ERR_OK: break;
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            return 'ファイルが大きすぎてサーバーが受け取れませんでした。Xサーバーのサーバーパネル「php.ini設定」で upload_max_filesize と post_max_size を大きくしてください（例：20M と 25M）。';
        default:
            return 'ファイルを受け取れませんでした（エラー番号 ' . (int)$f['error'] . '）。もう一度お試しください。';
    }
    if ($f['size'] > MAX_BYTES) return 'ファイルは20MBまでです。';
    if (!is_uploaded_file($f['tmp_name'])) return 'ファイルを受け取れませんでした。';
    return null;
}

function page_start(string $title): void
{
    echo '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>' . h($title) . '｜East-one 管理</title>
<style>
:root{--pink:#D24F93;--pink-deep:#A83A73;--ink:#2E2530;--sub:#5B5262;--mist:#FBF3F7;--line:#EBD9E4}
*{box-sizing:border-box}body{margin:0;font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif;font-size:16px;line-height:1.8;color:var(--ink);background:var(--mist)}
header{background:var(--pink);color:#fff;padding:14px 20px;font-weight:700;font-size:18px}
main{max-width:860px;margin:0 auto;padding:20px 16px 60px;position:relative}
h1{font-size:22px;margin:4px 0 16px}h2{font-size:19px;margin:0 0 14px;color:var(--pink-deep)}h3{font-size:16px;margin:22px 0 8px;padding-left:10px;border-left:4px solid var(--pink)}
.box{background:#fff;border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin:0 0 18px}
.ok{border-color:#7cc59a;background:#effaf3}.err{border-color:#e08a8a;background:#fdf0f0}
label{display:block;margin:0 0 12px;font-weight:700;font-size:15px}
input[type=text],input[type=url],input[type=date],input[type=password],select{display:block;width:100%;margin-top:4px;font:inherit;padding:9px 10px;border:1px solid #cdbfc8;border-radius:6px;background:#fff}
fieldset{border:1px solid var(--line);border-radius:8px;margin:0 0 12px;padding:8px 14px}legend{font-weight:700;font-size:15px}
.radio{font-weight:400;margin:4px 0}.hint{font-size:14px;color:var(--sub);margin:6px 0 0}
.src{margin:0 0 14px}
.btn{font:inherit;font-weight:700;background:var(--pink-deep);color:#fff;border:0;border-radius:8px;padding:10px 22px;cursor:pointer}
.btn.small{padding:6px 14px;font-size:14px}.btn.ghost{background:#fff;color:var(--pink-deep);border:2px solid var(--pink-deep)}.btn.danger{background:#b3261e}
.link{background:none;border:0;color:var(--pink-deep);text-decoration:underline;font:inherit;cursor:pointer}
.logout{position:absolute;top:22px;right:16px}
.docs{list-style:none;margin:0;padding:0}.docs li{border-bottom:1px solid var(--line);padding:10px 0}
.docs li.hidden .meta a{color:#999}.type{display:inline-block;font-size:12px;font-weight:700;background:var(--mist);border:1px solid var(--line);border-radius:4px;padding:0 6px;margin-right:4px}
.off{display:inline-block;font-size:12px;font-weight:700;background:#666;color:#fff;border-radius:4px;padding:0 6px}
details{margin-top:6px}summary{cursor:pointer;font-size:14px;color:var(--sub)}
.edit{margin:10px 0}.row{display:flex;gap:10px;flex-wrap:wrap}
.login{max-width:380px}
</style></head><body><header>East-one ホームページ 管理</header><main><h1>' . h($title) . '</h1>';
}

function page_end(): never
{
    echo '</main><script>
document.querySelectorAll("input[name=source]").forEach(function(r){r.addEventListener("change",sync)});
function sync(){var v=(document.querySelector("input[name=source]:checked")||{}).value;
document.querySelectorAll(".src").forEach(function(d){d.style.display=d.classList.contains("src-"+v)?"":"none"})}
sync();
</script></body></html>';
    exit;
}
