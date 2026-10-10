<?php
/**
 * East-one 業務サポート API（Xサーバー レンタルサーバー用）
 *
 * データはすべて「種別(coll) + ID + JSON」の形で保存する。
 * シフト・送迎・時間割の自動作成などの計算はブラウザ側で行う。
 */
declare(strict_types=1);

require __DIR__ . '/lib.php';

start_session();
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ($action) {
    case 'login': {
        if ($method !== 'POST') fail(405, 'POST で送信してください。');
        require_ajax();
        $password = (string)(body()['password'] ?? '');
        $expected = (string)(config()['password'] ?? '');
        if ($expected === '' || $expected === 'ここにパスワードを入れる') fail(500, 'config.php でパスワードを設定してください。');
        if (!hash_equals($expected, $password)) {
            usleep(800000);
            fail(401, 'パスワードが違います。');
        }
        session_regenerate_id(true);
        $_SESSION['eo_user'] = 'staff';
        json_out(['ok' => true]);
    }

    case 'logout': {
        require_ajax();
        $_SESSION = [];
        session_destroy();
        json_out(['ok' => true]);
    }

    case 'me': {
        require_login();
        db();
        json_out(['user' => $_SESSION['eo_user'], 'ai' => trim((string)(config()['anthropic_api_key'] ?? '')) !== '']);
    }

    case 'list': {
        require_login();
        $coll = check_coll((string)($_GET['c'] ?? ''));
        $sql = 'SELECT id, data, updated_at FROM eo_docs WHERE coll = ?';
        $args = [$coll];
        if (isset($_GET['from'])) { $sql .= ' AND id >= ?'; $args[] = check_id((string)$_GET['from']); }
        if (isset($_GET['to'])) { $sql .= ' AND id <= ?'; $args[] = check_id((string)$_GET['to']); }
        if (isset($_GET['prefix'])) { $sql .= ' AND id LIKE ?'; $args[] = check_id((string)$_GET['prefix']) . '%'; }
        if (isset($_GET['suffix'])) { $sql .= ' AND id LIKE ?'; $args[] = '%' . check_id((string)$_GET['suffix']); }
        $stmt = db()->prepare($sql . ' ORDER BY id');
        $stmt->execute($args);
        $docs = [];
        foreach ($stmt as $row) {
            $docs[] = ['id' => $row['id'], 'data' => json_decode($row['data'], true), 'updated_at' => $row['updated_at']];
        }
        json_out(['docs' => $docs]);
    }

    case 'get': {
        require_login();
        $coll = check_coll((string)($_GET['c'] ?? ''));
        $id = check_id((string)($_GET['id'] ?? ''));
        $stmt = db()->prepare('SELECT data, updated_at FROM eo_docs WHERE coll = ? AND id = ?');
        $stmt->execute([$coll, $id]);
        $row = $stmt->fetch();
        json_out(['doc' => $row ? ['id' => $id, 'data' => json_decode($row['data'], true), 'updated_at' => $row['updated_at']] : null]);
    }

    case 'batch': {
        // 複数の保存・削除を 1 回でまとめて行う（途中で失敗したら全部取り消し）
        if ($method !== 'POST') fail(405, 'POST で送信してください。');
        require_login();
        require_ajax();
        $ops = body()['ops'] ?? null;
        if (!is_array($ops) || count($ops) > 2000) fail(400, '保存内容が正しくありません。');
        $pdo = db();
        $results = [];
        $pdo->beginTransaction();
        try {
            foreach ($ops as $op) {
                $coll = check_coll((string)($op['c'] ?? ''));
                if (($op['op'] ?? '') === 'delete') {
                    $id = check_id((string)($op['id'] ?? ''));
                    $pdo->prepare('DELETE FROM eo_docs WHERE coll = ? AND id = ?')->execute([$coll, $id]);
                    $results[] = ['c' => $coll, 'id' => $id];
                    continue;
                }
                $data = $op['data'] ?? null;
                if (!is_array($data)) fail(400, '保存内容が正しくありません。');
                $rawId = isset($op['id']) && $op['id'] !== null && $op['id'] !== '' ? (string)$op['id'] : '';
                if ($rawId === '') {
                    if (!in_array($coll, NUMBERED, true)) fail(400, 'ID が必要です。');
                    $rawId = (string)next_id($pdo, $coll);
                }
                $id = check_id($rawId);
                if (in_array($coll, NUMBERED, true)) $data['id'] = (int)$id;
                put_doc($pdo, $coll, $id, $data);
                $results[] = ['c' => $coll, 'id' => $id];
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        json_out(['results' => $results]);
    }

    case 'generate': {
        if ($method !== 'POST') fail(405, 'POST で送信してください。');
        require_login();
        require_ajax();
        $prompt = trim((string)(body()['prompt'] ?? ''));
        if ($prompt === '' || mb_strlen($prompt) > 20000) fail(400, '作成の材料が正しくありません。');
        require __DIR__ . '/report.php';
        session_write_close();
        json_out(generate_report($prompt));
    }

    default:
        fail(404, '不明な操作です。');
}
