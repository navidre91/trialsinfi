<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

cts_init_api();

function cts_fetch_physicians(PDO $pdo): array
{
    $statement = $pdo->query(
        'SELECT id, physician_id, username, full_name, credentials, must_change_password, is_active, last_login_at, created_at, updated_at
         FROM physicians
         ORDER BY full_name COLLATE NOCASE ASC'
    );

    $physicians = [];
    foreach ($statement->fetchAll() as $row) {
        $physicians[] = [
            'id' => (int)$row['id'],
            'physicianId' => $row['physician_id'],
            'username' => $row['username'],
            'fullName' => $row['full_name'],
            'credentials' => $row['credentials'],
            'mustChangePassword' => (bool)$row['must_change_password'],
            'isActive' => (bool)$row['is_active'],
            'lastLoginAt' => $row['last_login_at'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at']
        ];
    }

    return $physicians;
}

try {
    $pdo = cts_db();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        cts_require_role($pdo, 'admin');
        cts_json_response([
            'success' => true,
            'physicians' => cts_fetch_physicians($pdo)
        ]);
    }

    $actor = cts_require_role($pdo, 'admin');
    cts_require_csrf();
    $input = cts_read_json_input();

    if ($method === 'POST') {
        $physicianId = trim((string)($input['physician_id'] ?? ''));
        $username = trim((string)($input['username'] ?? ''));
        $fullName = trim((string)($input['full_name'] ?? ''));
        $credentials = trim((string)($input['credentials'] ?? ''));
        $temporaryPassword = (string)($input['temporary_password'] ?? '');

        if ($physicianId === '' || $username === '' || $fullName === '' || $temporaryPassword === '') {
            cts_json_response([
                'success' => false,
                'message' => 'Physician ID, username, full name, and temporary password are required.'
            ], 400);
        }

        $passwordError = cts_password_validation_error($temporaryPassword);
        if ($passwordError !== null) {
            cts_json_response([
                'success' => false,
                'message' => $passwordError
            ], 400);
        }

        $statement = $pdo->prepare(
            'INSERT INTO physicians (
                physician_id,
                username,
                full_name,
                credentials,
                password_hash,
                must_change_password,
                is_active,
                created_at,
                updated_at
             ) VALUES (
                :physician_id,
                :username,
                :full_name,
                :credentials,
                :password_hash,
                1,
                1,
                :created_at,
                :updated_at
             )'
        );

        try {
            $statement->execute([
                ':physician_id' => $physicianId,
                ':username' => $username,
                ':full_name' => $fullName,
                ':credentials' => $credentials,
                ':password_hash' => password_hash($temporaryPassword, PASSWORD_DEFAULT),
                ':created_at' => cts_now(),
                ':updated_at' => cts_now()
            ]);
        } catch (Throwable $throwable) {
            cts_json_response([
                'success' => false,
                'message' => 'Physician ID or username is already in use.'
            ], 409);
        }

        cts_audit_log($pdo, 'physician_created', 'physician', $physicianId, [
            'username' => $username,
            'full_name' => $fullName
        ], $actor);

        cts_json_response([
            'success' => true,
            'message' => 'Physician account created successfully.',
            'physicians' => cts_fetch_physicians($pdo)
        ], 201);
    }

    if ($method === 'PUT') {
        $action = trim((string)($input['action'] ?? ''));
        $physicianId = trim((string)($input['physician_id'] ?? ''));

        if ($action === '' || $physicianId === '') {
            cts_json_response([
                'success' => false,
                'message' => 'Action and physician ID are required.'
            ], 400);
        }

        $statement = $pdo->prepare('SELECT id, physician_id, username, full_name FROM physicians WHERE physician_id = :physician_id LIMIT 1');
        $statement->execute([':physician_id' => $physicianId]);
        $physician = $statement->fetch();

        if (!$physician) {
            cts_json_response([
                'success' => false,
                'message' => 'Physician not found.'
            ], 404);
        }

        if ($action === 'reset_password') {
            $temporaryPassword = (string)($input['temporary_password'] ?? '');
            if ($temporaryPassword === '') {
                cts_json_response([
                    'success' => false,
                    'message' => 'Temporary password is required.'
                ], 400);
            }

            $passwordError = cts_password_validation_error($temporaryPassword);
            if ($passwordError !== null) {
                cts_json_response([
                    'success' => false,
                    'message' => $passwordError
                ], 400);
            }

            $updateStatement = $pdo->prepare(
                'UPDATE physicians
                 SET password_hash = :password_hash,
                     must_change_password = 1,
                     updated_at = :updated_at
                 WHERE id = :id'
            );
            $updateStatement->execute([
                ':password_hash' => password_hash($temporaryPassword, PASSWORD_DEFAULT),
                ':updated_at' => cts_now(),
                ':id' => (int)$physician['id']
            ]);

            cts_audit_log($pdo, 'physician_password_reset', 'physician', $physicianId, [
                'username' => $physician['username']
            ], $actor);

            cts_json_response([
                'success' => true,
                'message' => 'Temporary password reset successfully.',
                'physicians' => cts_fetch_physicians($pdo)
            ]);
        }

        if ($action === 'activate' || $action === 'deactivate') {
            $isActive = $action === 'activate' ? 1 : 0;
            $updateStatement = $pdo->prepare(
                'UPDATE physicians
                 SET is_active = :is_active,
                     updated_at = :updated_at
                 WHERE id = :id'
            );
            $updateStatement->execute([
                ':is_active' => $isActive,
                ':updated_at' => cts_now(),
                ':id' => (int)$physician['id']
            ]);

            cts_audit_log($pdo, 'physician_' . $action, 'physician', $physicianId, [
                'username' => $physician['username']
            ], $actor);

            cts_json_response([
                'success' => true,
                'message' => $action === 'activate' ? 'Physician activated successfully.' : 'Physician deactivated successfully.',
                'physicians' => cts_fetch_physicians($pdo)
            ]);
        }

        cts_json_response([
            'success' => false,
            'message' => 'Unknown physician action.'
        ], 400);
    }

    cts_json_response([
        'success' => false,
        'message' => 'Method not allowed.'
    ], 405);
} catch (Throwable $throwable) {
    cts_json_response([
        'success' => false,
        'message' => 'Server error: ' . $throwable->getMessage()
    ], 500);
}
