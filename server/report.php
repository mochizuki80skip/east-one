<?php
declare(strict_types=1);

use Anthropic\Client;
use Anthropic\Core\Exceptions\APIConnectionException;
use Anthropic\Core\Exceptions\APIStatusException;
use Anthropic\Core\Exceptions\AuthenticationException;
use Anthropic\Core\Exceptions\RateLimitException;

const REPORT_SYSTEM_PROMPT = <<<'TXT'
あなたは機能訓練型デイサービスの生活相談員・機能訓練指導員です。
ご家族やケアマネジャーに提出する「月次報告（今月のご様子）」の文章を作成します。

書き方のルール:
- 敬体（です・ます調）で、温かみがあり、かつ事実に基づいた簡潔な文章にする。
- 与えられた情報（日々の記録・キーワード）に書かれていない出来事や数値を創作しない。情報が少ない場合は、その範囲で無理なくまとめる。
- ケアマネジャー向けの月次報告書に、利用者ごとに数行ずつ並べて掲載する。身体機能の変化、機能訓練・整体での様子、ご本人の発言や生活面の様子を中心に書く。
- 全体で 100〜200 字程度。見出しや箇条書きは使わず、1 段落で書く。冒頭に利用者名は書かない（書式側で「〇〇様」と付く）。
- 医学的な診断や断定的な評価は避け、観察された様子として書く。
- 出力は本文のみ。前置きや説明文は付けない。
TXT;

/**
 * Claude で月次報告文を作成する。
 * @return array{text?: string, engine: string, warning?: string}
 */
function generate_report(string $prompt): array
{
    $cfg = config();
    $key = trim((string)($cfg['anthropic_api_key'] ?? ''));
    if ($key === '') {
        return ['engine' => 'none', 'warning' => 'AI のキーが未設定のため、簡易テンプレートで作成しました。'];
    }
    $autoload = __DIR__ . '/vendor/autoload.php';
    if (!is_file($autoload)) {
        return ['engine' => 'none', 'warning' => 'AI 用のライブラリ（vendor フォルダ）が見つからないため、簡易テンプレートで作成しました。'];
    }
    require_once $autoload;

    try {
        $client = new Client(apiKey: $key);
        $message = $client->messages->create(
            model: (string)($cfg['model'] ?? 'claude-opus-5'),
            maxTokens: 4096,
            system: [
                ['type' => 'text', 'text' => REPORT_SYSTEM_PROMPT, 'cacheControl' => ['type' => 'ephemeral']],
            ],
            messages: [['role' => 'user', 'content' => $prompt]],
        );
        if ($message->stopReason === 'refusal') {
            return ['engine' => 'none', 'warning' => 'AI が作成を見送ったため、簡易テンプレートで作成しました。'];
        }
        $text = '';
        foreach ($message->content as $block) {
            if ($block->type === 'text') $text .= $block->text;
        }
        $text = trim($text);
        if ($text === '') return ['engine' => 'none', 'warning' => 'AI の応答が空だったため、簡易テンプレートで作成しました。'];
        return ['engine' => 'claude', 'text' => $text];
    } catch (AuthenticationException $e) {
        $reason = 'API キーが無効です';
    } catch (RateLimitException $e) {
        $reason = 'API の利用制限に達しました。時間をおいて再試行してください';
    } catch (APIStatusException $e) {
        $reason = 'API エラー（' . ($e->type?->value ?? 'unknown') . '）';
    } catch (APIConnectionException $e) {
        $reason = 'AI に接続できませんでした';
    } catch (Throwable $e) {
        $reason = 'エラー: ' . $e->getMessage();
    }
    return ['engine' => 'none', 'warning' => "AI での作成に失敗したため簡易テンプレートで作成しました（{$reason}）。"];
}
