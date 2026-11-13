<?php
/**
 * 住所 → 緯度・経度（国土地理院の住所検索 API。無料・キー不要）。
 * 同じ住所はデータベースに覚えておき、2 回目からは問い合わせない。
 * config.php の 'geocode_url' で問い合わせ先を変えられる（動作確認用）。
 */

const GEOCODE_DEFAULT_URL = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=';

/** 住所の書き方の揺れをそろえる（全角英数→半角、空白を詰める） */
function geocode_normalize(string $q): string
{
    $q = mb_convert_kana($q, 'as', 'UTF-8');
    $q = preg_replace('/\s+/u', '', $q) ?? $q;
    return trim($q);
}

function geocode_fetch(string $url): ?string
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERAGENT => 'East-one-support/1.0',
            CURLOPT_FOLLOWLOCATION => true,
        ]);
        $res = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return is_string($res) && $code >= 200 && $code < 300 ? $res : null;
    }
    $ctx = stream_context_create(['http' => ['timeout' => 8, 'header' => "User-Agent: East-one-support/1.0\r\n"]]);
    $res = @file_get_contents($url, false, $ctx);
    return is_string($res) ? $res : null;
}

/** @return array{lat: float, lng: float, title: string}|null */
function geocode_address(string $address): ?array
{
    $q = geocode_normalize($address);
    if ($q === '' || mb_strlen($q) > 200) return null;
    $pdo = db();
    $id = sha1($q);
    $stmt = $pdo->prepare('SELECT data FROM eo_docs WHERE coll = ? AND id = ?');
    $stmt->execute(['geocode', $id]);
    if ($row = $stmt->fetch()) {
        $cached = json_decode($row['data'], true);
        return is_array($cached) && isset($cached['lat']) ? $cached : null;
    }
    $base = (string)(config()['geocode_url'] ?? GEOCODE_DEFAULT_URL);
    $raw = geocode_fetch($base . rawurlencode($q));
    if ($raw === null) fail(502, '住所から位置を調べるサービスにつながりませんでした。時間をおいてもう一度お試しください。');
    $list = json_decode($raw, true);
    $first = is_array($list) ? ($list[0] ?? null) : null;
    $coords = $first['geometry']['coordinates'] ?? null;
    $result = null;
    if (is_array($coords) && count($coords) >= 2 && is_numeric($coords[0]) && is_numeric($coords[1])) {
        $result = ['lat' => (float)$coords[1], 'lng' => (float)$coords[0], 'title' => (string)($first['properties']['title'] ?? '')];
    }
    // 見つからなかった住所も覚えておく（何度も問い合わせない）
    put_doc($pdo, 'geocode', $id, $result ?? ['none' => true, 'q' => $q]);
    return $result;
}
