<?php
declare(strict_types=1);

/** 保存できるデータの種類 */
const COLLECTIONS = [
    'stores', 'staff', 'care_managers', 'vehicles', 'routes', 'clients',
    'shifts', 'shift_requests', 'daily', 'monthly',
];
/** 連番の ID を振るデータの種類 */
const NUMBERED = ['stores', 'staff', 'care_managers', 'vehicles', 'routes', 'clients'];

function config(): array
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . '/config.php';
        if (!is_file($file)) {
            fail(500, 'config.php がありません。config.sample.php をコピーして設定してください。');
        }
        $config = require $file;
    }
    return $config;
}

function json_out(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $status, string $message): never
{
    json_out(['error' => $message], $status);
}

function body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    if (!is_array($data)) fail(400, 'リクエストの形式が正しくありません。');
    return $data;
}

function now(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('Asia/Tokyo')))->format('Y-m-d H:i:s');
}

// ---------------- データベース ----------------
function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = config()['db'] ?? [];
    try {
        if (($c['driver'] ?? '') === 'sqlite') {
            $pdo = new PDO('sqlite:' . $c['path']);
            $pdo->exec('PRAGMA journal_mode = WAL');
        } else {
            $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $c['host'] ?? 'localhost', $c['name'] ?? '');
            $pdo = new PDO($dsn, $c['user'] ?? '', $c['pass'] ?? '');
        }
    } catch (PDOException $e) {
        fail(500, 'データベースに接続できません。config.php の設定を確認してください。');
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    migrate($pdo);
    return $pdo;
}

function is_mysql(PDO $pdo): bool
{
    return $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
}

function migrate(PDO $pdo): void
{
    $suffix = is_mysql($pdo) ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin' : '';
    $pdo->exec("CREATE TABLE IF NOT EXISTS eo_docs (
        coll VARCHAR(32) NOT NULL,
        id VARCHAR(100) NOT NULL,
        data MEDIUMTEXT NOT NULL,
        updated_at VARCHAR(19) NOT NULL,
        PRIMARY KEY (coll, id)
    )$suffix");
    $pdo->exec("CREATE TABLE IF NOT EXISTS eo_counters (
        coll VARCHAR(32) NOT NULL PRIMARY KEY,
        next_id INTEGER NOT NULL
    )$suffix");
}

function check_coll(string $c): string
{
    if (!in_array($c, COLLECTIONS, true)) fail(400, "不明なデータ種別です: $c");
    return $c;
}

function check_id(string $id): string
{
    if ($id === '' || strlen($id) > 100 || !preg_match('/^[0-9A-Za-z:\-_]+$/', $id)) fail(400, 'ID が正しくありません。');
    return $id;
}

function next_id(PDO $pdo, string $coll): int
{
    $up = $pdo->prepare('UPDATE eo_counters SET next_id = next_id + 1 WHERE coll = ?');
    $up->execute([$coll]);
    if ($up->rowCount() === 0) {
        // 既存データの最大 ID の次から
        $max = 0;
        foreach ($pdo->query('SELECT id FROM eo_docs WHERE coll = ' . $pdo->quote($coll)) as $row) {
            $max = max($max, (int)$row['id']);
        }
        $pdo->prepare('INSERT INTO eo_counters (coll, next_id) VALUES (?, ?)')->execute([$coll, $max + 2]);
        return $max + 1;
    }
    $sel = $pdo->prepare('SELECT next_id FROM eo_counters WHERE coll = ?');
    $sel->execute([$coll]);
    return (int)$sel->fetchColumn() - 1;
}

function put_doc(PDO $pdo, string $coll, string $id, array $data): void
{
    $json = json_encode($data, JSON_UNESCAPED_UNICODE);
    $sql = is_mysql($pdo)
        ? 'INSERT INTO eo_docs (coll, id, data, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)'
        : 'INSERT INTO eo_docs (coll, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at';
    $pdo->prepare($sql)->execute([$coll, $id, $json, now()]);
}

// ---------------- ログイン ----------------
function start_session(): void
{
    $hours = (int)(config()['session_hours'] ?? 12);
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('EASTONE');
    session_set_cookie_params([
        'lifetime' => $hours * 3600,
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    ini_set('session.gc_maxlifetime', (string)($hours * 3600));
    session_start();
}

function require_login(): void
{
    if (empty($_SESSION['eo_user'])) fail(401, 'ログインが必要です。');
}

/** 書き込み系のリクエストは JSON と専用ヘッダーを必須にする（他サイトからの送信対策） */
function require_ajax(): void
{
    if (($_SERVER['HTTP_X_EAST_ONE'] ?? '') !== '1') fail(403, '不正なリクエストです。');
}
