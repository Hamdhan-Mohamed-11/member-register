<?php
/**
 * The PaB Store's catalogue, as JSON, for the member portal.
 *
 * Drop this file in the same folder as index.php and lib.php on the store,
 * then point the portal's PAB_STORE_URL at this site. The portal fetches this
 * once a minute and serves members from its own cache, so this endpoint is
 * hit a handful of times an hour however many members are browsing.
 *
 * Read-only. It exposes exactly what the storefront already shows anybody who
 * visits: the active books, their prices, stock and covers. No orders, no
 * customers, no settings.
 *
 * If you would rather it not be public, set PAB_STORE_TOKEN on the store and
 * the same value in the portal's environment -- the portal sends it as a
 * header and anything without it gets a 404, which gives away less than a
 * 401 does.
 */

header('X-Robots-Tag: noindex, nofollow');

require __DIR__ . '/lib.php';

// Optional shared secret. Absent on both sides means the endpoint is public,
// which is the same as the storefront itself.
$expected = getenv('PAB_STORE_TOKEN');
if ($expected !== false && $expected !== '') {
    $sent = $_SERVER['HTTP_X_PAB_TOKEN'] ?? '';
    if (!hash_equals($expected, $sent)) {
        http_response_code(404);
        exit;
    }
}

$books = array_values(array_filter(load_books(), fn($b) => !empty($b['active'])));

$out = [];
foreach ($books as $b) {
    // Covers are served from this site. An absolute URL saves the portal
    // having to know how the store lays its folders out.
    //
    // book_cover() is the storefront's own helper, so a cover looks the same
    // in the portal as it does here -- including whatever it does about
    // missing files and absolute URLs. The manual path is the fallback for an
    // install that does not have it.
    $cover = null;
    if (function_exists('book_cover')) {
        $c = book_cover($b);
        if ($c) {
            $cover = preg_match('~^https?://~i', $c)
                ? $c
                : rtrim(base_url(), '/') . '/' . ltrim($c, '/');
        }
    } elseif (!empty($b['image']) && is_file(__DIR__ . '/images/' . $b['image'])) {
        $cover = rtrim(base_url(), '/') . '/images/' . rawurlencode($b['image']);
    }

    $out[] = [
        'id'           => (int)$b['id'],
        'title'        => (string)($b['title'] ?? ''),
        'author'       => (string)($b['author'] ?? ''),
        'isbn'         => ($b['isbn'] ?? '') !== '' ? (string)$b['isbn'] : null,
        'category'     => ($b['category'] ?? '') !== '' ? (string)$b['category'] : null,
        'description'  => ($b['description'] ?? '') !== '' ? (string)$b['description'] : null,
        'price'        => (float)($b['price'] ?? 0),
        'marketPrice'  => isset($b['market_price']) && $b['market_price'] !== ''
                            ? (float)$b['market_price'] : null,
        'stock'        => (int)($b['stock'] ?? 0),
        'featured'     => !empty($b['featured']),
        'coverUrl'     => $cover,
        'url'          => rtrim(base_url(), '/') . '/book.php?id=' . (int)$b['id'],
    ];
}

header('Content-Type: application/json; charset=utf-8');
// A minute of staleness is fine for a book list, and it keeps a burst of
// portal instances from all asking at once.
header('Cache-Control: public, max-age=60');

echo json_encode(
    ['generatedAt' => gmdate('c'), 'count' => count($out), 'books' => $out],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);
