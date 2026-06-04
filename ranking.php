<?php
header('Content-Type: application/json; charset=utf-8');

$file = __DIR__ . '/ranking.json';

if (!file_exists($file)) {
    file_put_contents($file, json_encode([], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
}

$rankings = json_decode(file_get_contents($file), true);
if (!is_array($rankings)) {
    $rankings = [];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid json'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $name = trim((string)($input['name'] ?? '名無し'));
    $name = strip_tags($name);

    if (function_exists('mb_substr')) {
        $name = mb_substr($name, 0, 12, 'UTF-8');
    } else {
        $name = substr($name, 0, 36);
    }

    $name  = $name !== '' ? $name : '名無し';
    $score = max(0, intval($input['score'] ?? 0));
    $rate  = max(0, min(100, intval($input['rate'] ?? 0)));
    $lines = max(0, intval($input['lines'] ?? 0));
    $combo = max(0, intval($input['combo'] ?? 0));
    $level = max(1, intval($input['level'] ?? 1));

    foreach ($rankings as $item) {
        if (
            ($item['name'] ?? '') === $name &&
            intval($item['score'] ?? 0) === $score &&
            intval($item['lines'] ?? 0) === $lines
        ) {
            echo json_encode($rankings, JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    $rankings[] = [
        'name'  => $name,
        'score' => $score,
        'rate'  => $rate,
        'lines' => $lines,
        'combo' => $combo,
        'level' => $level,
        'date'  => date('Y-m-d H:i:s')
    ];

    usort($rankings, function($a, $b) {
        if (($b['score'] ?? 0) === ($a['score'] ?? 0)) {
            return ($b['lines'] ?? 0) <=> ($a['lines'] ?? 0);
        }

        return ($b['score'] ?? 0) <=> ($a['score'] ?? 0);
    });

    $rankings = array_slice($rankings, 0, 10);

    file_put_contents(
        $file,
        json_encode($rankings, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
        LOCK_EX
    );
}

echo json_encode($rankings, JSON_UNESCAPED_UNICODE);