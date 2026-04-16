<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

cts_init_api();

cts_json_response([
    'success' => false,
    'message' => 'This endpoint has been replaced by api/auth.php?action=change_password.'
], 410);
