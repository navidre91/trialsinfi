<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

cts_init_api();

function cts_community_group_metadata(): array
{
    return [
        'Prostate' => 'Localized, biochemical recurrence, and mCRPC case discussion with trial matching updates.',
        'Bladder' => 'NMIBC and MIBC treatment sequencing, perioperative planning, and trial eligibility exchange.',
        'Kidney' => 'RCC biomarker interpretation, metastatic case review, and first-line strategy threads.',
        'Testicular' => 'Rare and refractory cases, surveillance protocols, and referral pathways for active studies.',
        'Others' => 'Cross-disease genitourinary topics, basket studies, and broader solid-tumor discussions relevant to the physician forum.'
    ];
}

function cts_display_physician_name(array $row): string
{
    $fullName = trim((string)($row['full_name'] ?? ''));
    $credentials = trim((string)($row['credentials'] ?? ''));

    if ($fullName === '') {
        return $credentials !== '' ? $credentials : 'Unknown physician';
    }

    return $credentials !== '' ? $fullName . ', ' . $credentials : $fullName;
}

function cts_format_forum_reply(array $row, int $viewerPhysicianDbId, bool $threadLocked): array
{
    $canEdit = (int)$row['author_physician_id'] === $viewerPhysicianDbId && !$threadLocked && empty($row['deleted_at']);

    return [
        'id' => (int)$row['id'],
        'threadId' => (int)$row['thread_id'],
        'body' => $row['body'],
        'author' => [
            'displayName' => cts_display_physician_name($row),
            'fullName' => $row['full_name'],
            'credentials' => $row['credentials']
        ],
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
        'editedAt' => $row['edited_at'],
        'deletedAt' => $row['deleted_at'],
        'canEdit' => $canEdit
    ];
}

function cts_fetch_threads_with_replies(PDO $pdo, array $options = []): array
{
    $trialId = isset($options['trial_id']) ? trim((string)$options['trial_id']) : '';
    $includeDeleted = !empty($options['include_deleted']);
    $limit = isset($options['limit']) ? (int)$options['limit'] : 0;
    $viewerPhysicianDbId = isset($options['viewer_physician_db_id']) ? (int)$options['viewer_physician_db_id'] : 0;

    $sql = 'SELECT
                t.id,
                t.trial_id,
                t.disease_group,
                t.title,
                t.body,
                t.author_physician_id,
                t.reply_count,
                t.locked_at,
                t.deleted_at,
                t.created_at,
                t.updated_at,
                t.edited_at,
                p.full_name,
                p.credentials
            FROM forum_threads t
            INNER JOIN physicians p ON p.id = t.author_physician_id';

    $conditions = [];
    $params = [];

    if ($trialId !== '') {
        $conditions[] = 't.trial_id = :trial_id';
        $params[':trial_id'] = $trialId;
    }

    if (!$includeDeleted) {
        $conditions[] = 't.deleted_at IS NULL';
    }

    if (!empty($conditions)) {
        $sql .= ' WHERE ' . implode(' AND ', $conditions);
    }

    $sql .= ' ORDER BY t.created_at DESC, t.id DESC';
    if ($limit > 0) {
        $sql .= ' LIMIT ' . $limit;
    }

    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    $threadRows = $statement->fetchAll();

    if (empty($threadRows)) {
        return [];
    }

    $threadIds = [];
    $threadMap = [];
    foreach ($threadRows as $row) {
        $threadIds[] = (int)$row['id'];
        $threadMap[(int)$row['id']] = [
            'id' => (int)$row['id'],
            'trialId' => $row['trial_id'],
            'diseaseGroup' => $row['disease_group'],
            'title' => $row['title'],
            'body' => $row['body'],
            'replyCount' => (int)$row['reply_count'],
            'isLocked' => !empty($row['locked_at']),
            'lockedAt' => $row['locked_at'],
            'isDeleted' => !empty($row['deleted_at']),
            'deletedAt' => $row['deleted_at'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at'],
            'editedAt' => $row['edited_at'],
            'author' => [
                'displayName' => cts_display_physician_name($row),
                'fullName' => $row['full_name'],
                'credentials' => $row['credentials']
            ],
            'canEdit' => (int)$row['author_physician_id'] === $viewerPhysicianDbId && empty($row['locked_at']) && empty($row['deleted_at']),
            'replies' => []
        ];
    }

    $placeholders = implode(',', array_fill(0, count($threadIds), '?'));
    $replySql = 'SELECT
                    r.id,
                    r.thread_id,
                    r.body,
                    r.author_physician_id,
                    r.deleted_at,
                    r.created_at,
                    r.updated_at,
                    r.edited_at,
                    p.full_name,
                    p.credentials
                 FROM forum_replies r
                 INNER JOIN physicians p ON p.id = r.author_physician_id
                 WHERE r.thread_id IN (' . $placeholders . ')';

    if (!$includeDeleted) {
        $replySql .= ' AND r.deleted_at IS NULL';
    }

    $replySql .= ' ORDER BY r.created_at ASC, r.id ASC';

    $replyStatement = $pdo->prepare($replySql);
    $replyStatement->execute($threadIds);
    foreach ($replyStatement->fetchAll() as $replyRow) {
        $threadIdKey = (int)$replyRow['thread_id'];
        if (!isset($threadMap[$threadIdKey])) {
            continue;
        }

        $threadMap[$threadIdKey]['replies'][] = cts_format_forum_reply(
            $replyRow,
            $viewerPhysicianDbId,
            (bool)$threadMap[$threadIdKey]['isLocked']
        );
    }

    $threads = [];
    foreach ($threadRows as $row) {
        $threads[] = $threadMap[(int)$row['id']];
    }

    return $threads;
}

function cts_require_physician_forum_access(array $actor): void
{
    if (!empty($actor['record']['must_change_password'])) {
        cts_json_response([
            'success' => false,
            'message' => 'Password change required before accessing the forum.',
            'mustChangePassword' => true
        ], 403);
    }
}

try {
    $pdo = cts_db();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET' && (string)($_GET['bootstrap'] ?? '') === '1') {
        $actor = cts_require_role($pdo, 'physician');
        $trials = cts_load_trials_catalog();
        $groupMetadata = cts_community_group_metadata();
        $groups = [];

        if (empty($actor['record']['must_change_password'])) {
            foreach ($groupMetadata as $groupName => $description) {
                $groupTrials = [];
                foreach ($trials as $trial) {
                    if (($trial['cancerType'] ?? '') !== $groupName) {
                        continue;
                    }

                    $groupTrials[] = [
                        'id' => $trial['id'],
                        'title' => $trial['title'],
                        'status' => $trial['status'],
                        'hospital' => $trial['location']['hospital'] ?? '',
                        'instituteId' => $trial['instituteId'],
                        'piName' => $trial['piName'],
                        'phase' => $trial['phase'],
                        'lastWebsiteUpdate' => $trial['lastWebsiteUpdate'] ?: $trial['lastUpdated'],
                        'description' => $trial['description'],
                        'cancerType' => $trial['cancerType']
                    ];
                }

                $groups[] = [
                    'name' => $groupName,
                    'description' => $description,
                    'trialCount' => count($groupTrials),
                    'trials' => $groupTrials
                ];
            }
        }

        cts_json_response([
            'success' => true,
            'user' => [
                'physicianId' => $actor['record']['physician_id'],
                'username' => $actor['record']['username'],
                'fullName' => $actor['record']['full_name'],
                'credentials' => $actor['record']['credentials'],
                'mustChangePassword' => (bool)$actor['record']['must_change_password']
            ],
            'groups' => $groups
        ]);
    }

    if ($method === 'GET' && (string)($_GET['moderation'] ?? '') === '1') {
        $actor = cts_require_role($pdo, 'admin');
        $trials = cts_load_trials_catalog();
        $trialTitleMap = [];
        foreach ($trials as $trial) {
            $trialTitleMap[$trial['id']] = $trial['title'];
        }

        $threads = cts_fetch_threads_with_replies($pdo, [
            'include_deleted' => true,
            'limit' => 50
        ]);

        foreach ($threads as &$thread) {
            $thread['trialTitle'] = $trialTitleMap[$thread['trialId']] ?? 'Unknown trial';
        }
        unset($thread);

        cts_json_response([
            'success' => true,
            'threads' => $threads,
            'viewer' => cts_format_actor_for_response($actor)
        ]);
    }

    if ($method === 'GET') {
        $actor = cts_require_role($pdo, 'physician');
        cts_require_physician_forum_access($actor);

        $trialId = trim((string)($_GET['trial_id'] ?? ''));
        if ($trialId === '') {
            cts_json_response([
                'success' => false,
                'message' => 'Trial ID is required.'
            ], 400);
        }

        $trials = cts_load_trials_catalog();
        $trial = cts_find_trial($trials, $trialId);
        if (!$trial) {
            cts_json_response([
                'success' => false,
                'message' => 'Trial not found.'
            ], 404);
        }

        $threads = cts_fetch_threads_with_replies($pdo, [
            'trial_id' => $trialId,
            'viewer_physician_db_id' => (int)$actor['record']['id']
        ]);

        cts_json_response([
            'success' => true,
            'trial' => [
                'id' => $trial['id'],
                'title' => $trial['title'],
                'status' => $trial['status'],
                'description' => $trial['description'],
                'hospital' => $trial['location']['hospital'] ?? '',
                'city' => $trial['location']['city'] ?? '',
                'phase' => $trial['phase'],
                'instituteId' => $trial['instituteId'],
                'piName' => $trial['piName'],
                'lastWebsiteUpdate' => $trial['lastWebsiteUpdate'] ?: $trial['lastUpdated'],
                'cancerType' => $trial['cancerType']
            ],
            'threads' => $threads
        ]);
    }

    if ($method === 'POST') {
        $actor = cts_require_role($pdo, 'physician');
        cts_require_csrf();
        cts_require_physician_forum_access($actor);

        $input = cts_read_json_input();
        $type = trim((string)($input['type'] ?? ''));

        if ($type === 'thread') {
            $trialId = trim((string)($input['trial_id'] ?? ''));
            $title = trim((string)($input['title'] ?? ''));
            $body = trim((string)($input['body'] ?? ''));

            if ($trialId === '' || $title === '' || $body === '') {
                cts_json_response([
                    'success' => false,
                    'message' => 'Trial, title, and body are required to create a thread.'
                ], 400);
            }

            $trial = cts_find_trial(cts_load_trials_catalog(), $trialId);
            if (!$trial) {
                cts_json_response([
                    'success' => false,
                    'message' => 'Selected trial was not found.'
                ], 404);
            }

            $statement = $pdo->prepare(
                'INSERT INTO forum_threads (
                    trial_id,
                    disease_group,
                    title,
                    body,
                    author_physician_id,
                    reply_count,
                    created_at,
                    updated_at
                 ) VALUES (
                    :trial_id,
                    :disease_group,
                    :title,
                    :body,
                    :author_physician_id,
                    0,
                    :created_at,
                    :updated_at
                 )'
            );
            $statement->execute([
                ':trial_id' => $trialId,
                ':disease_group' => $trial['cancerType'] ?: 'Unspecified',
                ':title' => $title,
                ':body' => $body,
                ':author_physician_id' => (int)$actor['record']['id'],
                ':created_at' => cts_now(),
                ':updated_at' => cts_now()
            ]);

            $threadId = (int)$pdo->lastInsertId();
            cts_audit_log($pdo, 'thread_created', 'thread', (string)$threadId, [
                'trial_id' => $trialId
            ], $actor);

            cts_json_response([
                'success' => true,
                'message' => 'Discussion thread created successfully.'
            ], 201);
        }

        if ($type === 'reply') {
            $threadId = (int)($input['thread_id'] ?? 0);
            $body = trim((string)($input['body'] ?? ''));

            if ($threadId <= 0 || $body === '') {
                cts_json_response([
                    'success' => false,
                    'message' => 'Thread and reply body are required.'
                ], 400);
            }

            $threadStatement = $pdo->prepare(
                'SELECT id, locked_at, deleted_at FROM forum_threads WHERE id = :id LIMIT 1'
            );
            $threadStatement->execute([':id' => $threadId]);
            $thread = $threadStatement->fetch();

            if (!$thread || !empty($thread['deleted_at'])) {
                cts_json_response([
                    'success' => false,
                    'message' => 'Thread not found.'
                ], 404);
            }

            if (!empty($thread['locked_at'])) {
                cts_json_response([
                    'success' => false,
                    'message' => 'Thread is locked.'
                ], 403);
            }

            $statement = $pdo->prepare(
                'INSERT INTO forum_replies (
                    thread_id,
                    body,
                    author_physician_id,
                    created_at,
                    updated_at
                 ) VALUES (
                    :thread_id,
                    :body,
                    :author_physician_id,
                    :created_at,
                    :updated_at
                 )'
            );
            $statement->execute([
                ':thread_id' => $threadId,
                ':body' => $body,
                ':author_physician_id' => (int)$actor['record']['id'],
                ':created_at' => cts_now(),
                ':updated_at' => cts_now()
            ]);

            cts_refresh_thread_reply_count($pdo, $threadId);
            $replyId = (int)$pdo->lastInsertId();

            cts_audit_log($pdo, 'reply_created', 'reply', (string)$replyId, [
                'thread_id' => $threadId
            ], $actor);

            cts_json_response([
                'success' => true,
                'message' => 'Reply posted successfully.'
            ], 201);
        }

        cts_json_response([
            'success' => false,
            'message' => 'Unknown community create action.'
        ], 400);
    }

    if ($method === 'PUT') {
        $actor = cts_require_authenticated($pdo);
        cts_require_csrf();
        $input = cts_read_json_input();

        if (($actor['role'] ?? '') === 'physician') {
            cts_require_physician_forum_access($actor);
            $type = trim((string)($input['type'] ?? ''));

            if ($type === 'thread') {
                $threadId = (int)($input['thread_id'] ?? 0);
                $title = trim((string)($input['title'] ?? ''));
                $body = trim((string)($input['body'] ?? ''));

                if ($threadId <= 0 || $title === '' || $body === '') {
                    cts_json_response([
                        'success' => false,
                        'message' => 'Thread, title, and body are required.'
                    ], 400);
                }

                $statement = $pdo->prepare(
                    'SELECT id, author_physician_id, locked_at, deleted_at
                     FROM forum_threads
                     WHERE id = :id
                     LIMIT 1'
                );
                $statement->execute([':id' => $threadId]);
                $thread = $statement->fetch();

                if (!$thread || !empty($thread['deleted_at'])) {
                    cts_json_response([
                        'success' => false,
                        'message' => 'Thread not found.'
                    ], 404);
                }

                if ((int)$thread['author_physician_id'] !== (int)$actor['record']['id']) {
                    cts_json_response([
                        'success' => false,
                        'message' => 'You can only edit your own thread.'
                    ], 403);
                }

                if (!empty($thread['locked_at'])) {
                    cts_json_response([
                        'success' => false,
                        'message' => 'Thread is locked.'
                    ], 403);
                }

                $updateStatement = $pdo->prepare(
                    'UPDATE forum_threads
                     SET title = :title,
                         body = :body,
                         edited_at = :edited_at,
                         updated_at = :updated_at
                     WHERE id = :id'
                );
                $updateStatement->execute([
                    ':title' => $title,
                    ':body' => $body,
                    ':edited_at' => cts_now(),
                    ':updated_at' => cts_now(),
                    ':id' => $threadId
                ]);

                cts_audit_log($pdo, 'thread_updated', 'thread', (string)$threadId, [], $actor);

                cts_json_response([
                    'success' => true,
                    'message' => 'Thread updated successfully.'
                ]);
            }

            if ($type === 'reply') {
                $replyId = (int)($input['reply_id'] ?? 0);
                $body = trim((string)($input['body'] ?? ''));

                if ($replyId <= 0 || $body === '') {
                    cts_json_response([
                        'success' => false,
                        'message' => 'Reply and body are required.'
                    ], 400);
                }

                $statement = $pdo->prepare(
                    'SELECT r.id, r.author_physician_id, r.deleted_at, t.locked_at
                     FROM forum_replies r
                     INNER JOIN forum_threads t ON t.id = r.thread_id
                     WHERE r.id = :id
                     LIMIT 1'
                );
                $statement->execute([':id' => $replyId]);
                $reply = $statement->fetch();

                if (!$reply || !empty($reply['deleted_at'])) {
                    cts_json_response([
                        'success' => false,
                        'message' => 'Reply not found.'
                    ], 404);
                }

                if ((int)$reply['author_physician_id'] !== (int)$actor['record']['id']) {
                    cts_json_response([
                        'success' => false,
                        'message' => 'You can only edit your own reply.'
                    ], 403);
                }

                if (!empty($reply['locked_at'])) {
                    cts_json_response([
                        'success' => false,
                        'message' => 'Thread is locked.'
                    ], 403);
                }

                $updateStatement = $pdo->prepare(
                    'UPDATE forum_replies
                     SET body = :body,
                         edited_at = :edited_at,
                         updated_at = :updated_at
                     WHERE id = :id'
                );
                $updateStatement->execute([
                    ':body' => $body,
                    ':edited_at' => cts_now(),
                    ':updated_at' => cts_now(),
                    ':id' => $replyId
                ]);

                cts_audit_log($pdo, 'reply_updated', 'reply', (string)$replyId, [], $actor);

                cts_json_response([
                    'success' => true,
                    'message' => 'Reply updated successfully.'
                ]);
            }

            cts_json_response([
                'success' => false,
                'message' => 'Unknown physician update action.'
            ], 400);
        }

        if (($actor['role'] ?? '') === 'admin') {
            $action = trim((string)($input['action'] ?? ''));

            if ($action === 'lock_thread' || $action === 'unlock_thread' || $action === 'delete_thread') {
                $threadId = (int)($input['thread_id'] ?? 0);
                if ($threadId <= 0) {
                    cts_json_response([
                        'success' => false,
                        'message' => 'Thread ID is required.'
                    ], 400);
                }

                $statement = $pdo->prepare('SELECT id FROM forum_threads WHERE id = :id LIMIT 1');
                $statement->execute([':id' => $threadId]);
                if (!$statement->fetch()) {
                    cts_json_response([
                        'success' => false,
                        'message' => 'Thread not found.'
                    ], 404);
                }

                if ($action === 'lock_thread') {
                    $updateStatement = $pdo->prepare(
                        'UPDATE forum_threads
                         SET locked_at = :locked_at,
                             locked_by_admin_id = :locked_by_admin_id,
                             updated_at = :updated_at
                         WHERE id = :id'
                    );
                    $updateStatement->execute([
                        ':locked_at' => cts_now(),
                        ':locked_by_admin_id' => (int)$actor['record']['id'],
                        ':updated_at' => cts_now(),
                        ':id' => $threadId
                    ]);
                } elseif ($action === 'unlock_thread') {
                    $updateStatement = $pdo->prepare(
                        'UPDATE forum_threads
                         SET locked_at = NULL,
                             locked_by_admin_id = NULL,
                             updated_at = :updated_at
                         WHERE id = :id'
                    );
                    $updateStatement->execute([
                        ':updated_at' => cts_now(),
                        ':id' => $threadId
                    ]);
                } else {
                    $updateStatement = $pdo->prepare(
                        'UPDATE forum_threads
                         SET deleted_at = :deleted_at,
                             deleted_by_role = :deleted_by_role,
                             deleted_by_id = :deleted_by_id,
                             updated_at = :updated_at
                         WHERE id = :id'
                    );
                    $updateStatement->execute([
                        ':deleted_at' => cts_now(),
                        ':deleted_by_role' => 'admin',
                        ':deleted_by_id' => (int)$actor['record']['id'],
                        ':updated_at' => cts_now(),
                        ':id' => $threadId
                    ]);
                }

                cts_audit_log($pdo, $action, 'thread', (string)$threadId, [], $actor);

                cts_json_response([
                    'success' => true,
                    'message' => 'Moderation action applied successfully.'
                ]);
            }

            if ($action === 'delete_reply') {
                $replyId = (int)($input['reply_id'] ?? 0);
                if ($replyId <= 0) {
                    cts_json_response([
                        'success' => false,
                        'message' => 'Reply ID is required.'
                    ], 400);
                }

                $statement = $pdo->prepare('SELECT id, thread_id FROM forum_replies WHERE id = :id LIMIT 1');
                $statement->execute([':id' => $replyId]);
                $reply = $statement->fetch();

                if (!$reply) {
                    cts_json_response([
                        'success' => false,
                        'message' => 'Reply not found.'
                    ], 404);
                }

                $updateStatement = $pdo->prepare(
                    'UPDATE forum_replies
                     SET deleted_at = :deleted_at,
                         deleted_by_role = :deleted_by_role,
                         deleted_by_id = :deleted_by_id,
                         updated_at = :updated_at
                     WHERE id = :id'
                );
                $updateStatement->execute([
                    ':deleted_at' => cts_now(),
                    ':deleted_by_role' => 'admin',
                    ':deleted_by_id' => (int)$actor['record']['id'],
                    ':updated_at' => cts_now(),
                    ':id' => $replyId
                ]);

                cts_refresh_thread_reply_count($pdo, (int)$reply['thread_id']);
                cts_audit_log($pdo, 'delete_reply', 'reply', (string)$replyId, [], $actor);

                cts_json_response([
                    'success' => true,
                    'message' => 'Reply deleted successfully.'
                ]);
            }

            cts_json_response([
                'success' => false,
                'message' => 'Unknown admin moderation action.'
            ], 400);
        }

        cts_json_response([
            'success' => false,
            'message' => 'Unsupported session role.'
        ], 403);
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
