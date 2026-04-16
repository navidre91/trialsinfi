<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

cts_init_api();

function cts_handle_login(PDO $pdo, string $role, array $input): void
{
    $username = trim((string)($input['username'] ?? ''));
    $password = (string)($input['password'] ?? '');
    $ipAddress = cts_get_client_ip();

    if ($username === '' || $password === '') {
        cts_json_response([
            'success' => false,
            'message' => 'Username and password are required.'
        ], 400);
    }

    cts_require_login_not_locked($pdo, $username, $ipAddress);

    if ($role === 'admin') {
        $statement = $pdo->prepare(
            'SELECT id, username, password_hash, is_active, last_login_at
             FROM admins
             WHERE username = :username
             LIMIT 1'
        );
    } else {
        $statement = $pdo->prepare(
            'SELECT id, physician_id, username, full_name, credentials, password_hash, must_change_password, is_active, last_login_at
             FROM physicians
             WHERE username = :username
             LIMIT 1'
        );
    }

    $statement->execute([':username' => $username]);
    $record = $statement->fetch();

    $invalid = (
        !$record ||
        (int)($record['is_active'] ?? 0) !== 1 ||
        !password_verify($password, (string)($record['password_hash'] ?? ''))
    );

    if ($invalid) {
        cts_record_failed_login($pdo, $username, $ipAddress);
        cts_json_response([
            'success' => false,
            'message' => 'Invalid credentials.'
        ], 401);
    }

    cts_clear_failed_login($pdo, $username, $ipAddress);
    cts_issue_session($role, (int)$record['id']);

    $updateStatement = $pdo->prepare(
        sprintf('UPDATE %s SET last_login_at = :last_login_at, updated_at = :updated_at WHERE id = :id', $role === 'admin' ? 'admins' : 'physicians')
    );
    $updateStatement->execute([
        ':last_login_at' => cts_now(),
        ':updated_at' => cts_now(),
        ':id' => (int)$record['id']
    ]);

    $actor = cts_get_session_actor($pdo);
    if ($actor) {
        cts_audit_log($pdo, $role . '_login', $role, (string)$record['id'], [], $actor);
    }

    cts_json_response([
        'success' => true,
        'message' => 'Login successful.',
        'user' => $actor ? cts_format_actor_for_response($actor) : null,
        'csrfToken' => (string)($_SESSION['csrf_token'] ?? '')
    ]);
}

function cts_handle_change_password(PDO $pdo, array $actor, array $input): void
{
    $currentPassword = (string)($input['current_password'] ?? '');
    $newPassword = (string)($input['new_password'] ?? '');
    $confirmPassword = (string)($input['confirm_password'] ?? '');

    if ($currentPassword === '' || $newPassword === '' || $confirmPassword === '') {
        cts_json_response([
            'success' => false,
            'message' => 'Current password, new password, and confirmation are required.'
        ], 400);
    }

    if ($newPassword !== $confirmPassword) {
        cts_json_response([
            'success' => false,
            'message' => 'Password confirmation does not match.'
        ], 400);
    }

    $passwordError = cts_password_validation_error($newPassword);
    if ($passwordError !== null) {
        cts_json_response([
            'success' => false,
            'message' => $passwordError
        ], 400);
    }

    if (($actor['role'] ?? '') === 'admin') {
        $query = $pdo->prepare('SELECT password_hash FROM admins WHERE id = :id LIMIT 1');
        $query->execute([':id' => (int)$actor['record']['id']]);
        $record = $query->fetch();

        if (!$record || !password_verify($currentPassword, (string)$record['password_hash'])) {
            cts_json_response([
                'success' => false,
                'message' => 'Current password is incorrect.'
            ], 401);
        }

        $newUsername = trim((string)($input['new_username'] ?? ''));
        if ($newUsername === '') {
            cts_json_response([
                'success' => false,
                'message' => 'New username is required.'
            ], 400);
        }

        try {
            $statement = $pdo->prepare(
                'UPDATE admins
                 SET username = :username,
                     password_hash = :password_hash,
                     updated_at = :updated_at
                 WHERE id = :id'
            );
            $statement->execute([
                ':username' => $newUsername,
                ':password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
                ':updated_at' => cts_now(),
                ':id' => (int)$actor['record']['id']
            ]);
        } catch (Throwable $throwable) {
            cts_json_response([
                'success' => false,
                'message' => 'That username is already in use.'
            ], 409);
        }

        cts_issue_session('admin', (int)$actor['record']['id']);
        $freshActor = cts_get_session_actor($pdo);
        if ($freshActor) {
            cts_audit_log($pdo, 'admin_password_changed', 'admin', (string)$actor['record']['id'], [
                'username' => $newUsername
            ], $freshActor);
        }

        cts_json_response([
            'success' => true,
            'message' => 'Admin credentials updated successfully.',
            'user' => $freshActor ? cts_format_actor_for_response($freshActor) : null,
            'csrfToken' => (string)($_SESSION['csrf_token'] ?? '')
        ]);
    }

    $query = $pdo->prepare('SELECT password_hash FROM physicians WHERE id = :id LIMIT 1');
    $query->execute([':id' => (int)$actor['record']['id']]);
    $record = $query->fetch();

    if (!$record || !password_verify($currentPassword, (string)$record['password_hash'])) {
        cts_json_response([
            'success' => false,
            'message' => 'Current password is incorrect.'
        ], 401);
    }

    $statement = $pdo->prepare(
        'UPDATE physicians
         SET password_hash = :password_hash,
             must_change_password = 0,
             updated_at = :updated_at
         WHERE id = :id'
    );
    $statement->execute([
        ':password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
        ':updated_at' => cts_now(),
        ':id' => (int)$actor['record']['id']
    ]);

    cts_issue_session('physician', (int)$actor['record']['id']);
    $freshActor = cts_get_session_actor($pdo);
    if ($freshActor) {
        cts_audit_log($pdo, 'physician_password_changed', 'physician', (string)$actor['record']['physician_id'], [], $freshActor);
    }

    cts_json_response([
        'success' => true,
        'message' => 'Password updated successfully.',
        'user' => $freshActor ? cts_format_actor_for_response($freshActor) : null,
        'csrfToken' => (string)($_SESSION['csrf_token'] ?? '')
    ]);
}

try {
    $pdo = cts_db();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = trim((string)($_GET['action'] ?? ''));

    if ($method === 'GET' && $action === 'session') {
        $actor = cts_get_session_actor($pdo);
        cts_json_response([
            'success' => true,
            'authenticated' => (bool)$actor,
            'user' => $actor ? cts_format_actor_for_response($actor) : null,
            'csrfToken' => $actor ? $actor['csrf_token'] : null
        ]);
    }

    if ($method !== 'POST') {
        cts_json_response([
            'success' => false,
            'message' => 'Method not allowed.'
        ], 405);
    }

    $input = cts_read_json_input();

    if ($action === 'admin_login') {
        cts_handle_login($pdo, 'admin', $input);
    }

    if ($action === 'physician_login') {
        cts_handle_login($pdo, 'physician', $input);
    }

    if ($action === 'logout') {
        $actor = cts_require_authenticated($pdo);
        cts_require_csrf();
        cts_audit_log($pdo, $actor['role'] . '_logout', $actor['role'], (string)$actor['record']['id'], [], $actor);
        cts_destroy_session();

        cts_json_response([
            'success' => true,
            'message' => 'Logged out successfully.'
        ]);
    }

    if ($action === 'change_password') {
        $actor = cts_require_authenticated($pdo);
        cts_require_csrf();
        cts_handle_change_password($pdo, $actor, $input);
    }

    cts_json_response([
        'success' => false,
        'message' => 'Unknown auth action.'
    ], 404);
} catch (Throwable $throwable) {
    cts_json_response([
        'success' => false,
        'message' => 'Server error: ' . $throwable->getMessage()
    ], 500);
}
