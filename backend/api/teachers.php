<?php
require_once '../config/database.php';
require_once '../models/Teacher.php';

require_once '../config/cors.php';
applyCorsOrigin();
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';

// Role-based access control
$allowedRoles = [];
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $allowedRoles = ['admin', 'directeur', 'teacher', 'student'];
} else {
    // POST, PUT, DELETE
    $allowedRoles = ['admin', 'directeur'];
}
if (!in_array($_SESSION['user_role'], $allowedRoles)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès refusé - rôle non autorisé']);
    exit();
}

$database = new Database();
$db = $database->getConnection();
$teacher = new Teacher($db);

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);

function validateTeacherPayload($data) {
    if (!is_array($data)) return 'Corps de requête invalide.';
    if (array_key_exists('gender', $data) && trim((string)$data['gender']) !== ''
        && !in_array($data['gender'], ['male', 'female', 'other'], true)) {
        return 'Valeur de sexe invalide.';
    }
    if (array_key_exists('status', $data) && !in_array($data['status'], ['active', 'inactive', 'on_leave'], true)) {
        return 'Statut enseignant invalide.';
    }
    foreach (['birth_date', 'hire_date', 'contract_start_date', 'contract_end_date'] as $field) {
        if (!array_key_exists($field, $data) || trim((string)$data[$field]) === '') continue;
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', (string)$data[$field]);
        if (!$date || $date->format('Y-m-d') !== $data[$field]) return 'Une date du profil est invalide.';
    }
    if (!empty($data['contract_start_date']) && !empty($data['contract_end_date'])
        && $data['contract_end_date'] < $data['contract_start_date']) {
        return 'La fin du contrat ne peut pas précéder son début.';
    }
    if (array_key_exists('salary', $data) && $data['salary'] !== '' && (!is_numeric($data['salary']) || (float)$data['salary'] < 0)) {
        return 'Le salaire doit être un montant positif ou nul.';
    }
    if (array_key_exists('photo_url', $data) && trim((string)$data['photo_url']) !== '') {
        $url = trim((string)$data['photo_url']);
        $remote = filter_var($url, FILTER_VALIDATE_URL) && preg_match('#^https?://#i', $url);
        $local = preg_match('#^/uploads/profile-images/[A-Za-z0-9._-]+$#', $url);
        if (strlen($url) > 500 || (!$remote && !$local)) return 'Adresse de photo invalide.';
    }
    return null;
}

try {
    if ($method === 'GET') {
        if (in_array($_SESSION['user_role'], ['admin', 'directeur'], true)) {
            $stmt = $teacher->read();
        } elseif ($_SESSION['user_role'] === 'teacher') {
            $stmt = $db->prepare('SELECT * FROM teachers WHERE user_id = :user_id');
            $stmt->execute([':user_id' => $_SESSION['user_id']]);
        } else {
            $stmt = $db->query("
                SELECT id, teacher_number, first_name, last_name,
                       department, title, specialization, status
                FROM teachers
                WHERE status = 'active'
                ORDER BY last_name, first_name
            ");
        }
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $rows]);
    } elseif ($method === 'POST') {
        if ($validationError = validateTeacherPayload($input)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => $validationError]);
            exit();
        }
        $required = ['user_id', 'first_name', 'last_name', 'email'];
        foreach ($required as $k) {
            if (empty($input[$k])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => "Champ $k manquant."]);
                exit();
            }
        }
        if (!filter_var($input['email'], FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Email invalide.']);
            exit();
        }
        $teacher->user_id = $input['user_id'];
        $teacher->teacher_number = $input['teacher_number'] ?? null;
        $teacher->first_name = $input['first_name'];
        $teacher->last_name  = $input['last_name'];
        $teacher->email      = $input['email'];
        $teacher->phone      = $input['phone'] ?? null;
        $teacher->birth_date = $input['birth_date'] ?? null;
        $teacher->address    = $input['address'] ?? null;
        $teacher->city       = $input['city'] ?? null;
        $teacher->postal_code = $input['postal_code'] ?? null;
        $teacher->department = $input['department'] ?? null;
        $teacher->title      = $input['title'] ?? null;
        $teacher->specialization = $input['specialization'] ?? null;
        $teacher->hire_date  = $input['hire_date'] ?? null;
        $teacher->salary     = $input['salary'] ?? null;
        $teacher->status     = $input['status'] ?? 'active';

        if ($teacher->create()) {
            $teacherId = (int)$teacher->id;
            $extra = $db->prepare('UPDATE teachers SET gender = :gender, nationality = :nationality, profession = :profession, diploma = :diploma, contract_type = :contract_type, contract_start_date = :contract_start, contract_end_date = :contract_end, photo_url = :photo_url WHERE id = :id');
            $extra->execute([
                ':gender' => trim((string)($input['gender'] ?? '')) ?: null,
                ':nationality' => trim((string)($input['nationality'] ?? '')) ?: null,
                ':profession' => trim((string)($input['profession'] ?? '')) ?: null,
                ':diploma' => trim((string)($input['diploma'] ?? '')) ?: null,
                ':contract_type' => trim((string)($input['contract_type'] ?? '')) ?: null,
                ':contract_start' => $input['contract_start_date'] ?? null,
                ':contract_end' => $input['contract_end_date'] ?? null,
                ':photo_url' => trim((string)($input['photo_url'] ?? '')) ?: null,
                ':id' => $teacherId,
            ]);
            http_response_code(201);
            echo json_encode(['success' => true, 'message' => 'Enseignant ajouté.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de l'ajout de l'enseignant."]);
        }
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        if ($validationError = validateTeacherPayload($input)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => $validationError]);
            exit();
        }
        $teacher->id = intval($_GET['id']);
        $teacherRow = $teacher->read_single();
        if (!$teacherRow) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => "Enseignant non trouvé."]);
            exit();
        }
        if ($input) {
            if (isset($input['email']) && !filter_var($input['email'], FILTER_VALIDATE_EMAIL)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Email invalide.']);
                exit();
            }
            if (isset($input['email'])) {
                $duplicate = $db->prepare('SELECT id FROM users WHERE email = :email AND id <> :user_id AND deleted_at IS NULL');
                $duplicate->execute([':email' => trim($input['email']), ':user_id' => $teacher->user_id]);
                if ($duplicate->fetchColumn()) {
                    http_response_code(409);
                    echo json_encode(['success' => false, 'message' => 'Cette adresse e-mail est déjà utilisée.']);
                    exit();
                }
            }
            // Le rattachement au compte est immuable dans ce formulaire.
            foreach (['first_name', 'last_name', 'email', 'phone', 'birth_date', 'address', 'city', 'postal_code', 'department', 'title', 'specialization', 'hire_date', 'salary', 'status'] as $k) {
                if (isset($input[$k])) $teacher->$k = $input[$k];
            }
        }
        if ($teacher->update()) {
            $extra = $db->prepare('UPDATE teachers SET gender = :gender, nationality = :nationality, profession = :profession, diploma = :diploma, contract_type = :contract_type, contract_start_date = :contract_start, contract_end_date = :contract_end, photo_url = :photo_url WHERE id = :id');
            $extra->execute([
                ':gender' => trim((string)($input['gender'] ?? $teacherRow['gender'] ?? '')) ?: null,
                ':nationality' => trim((string)($input['nationality'] ?? $teacherRow['nationality'] ?? '')) ?: null,
                ':profession' => trim((string)($input['profession'] ?? $teacherRow['profession'] ?? '')) ?: null,
                ':diploma' => trim((string)($input['diploma'] ?? $teacherRow['diploma'] ?? '')) ?: null,
                ':contract_type' => trim((string)($input['contract_type'] ?? $teacherRow['contract_type'] ?? '')) ?: null,
                ':contract_start' => $input['contract_start_date'] ?? ($teacherRow['contract_start_date'] ?? null),
                ':contract_end' => $input['contract_end_date'] ?? ($teacherRow['contract_end_date'] ?? null),
                ':photo_url' => trim((string)($input['photo_url'] ?? $teacherRow['photo_url'] ?? '')) ?: null,
                ':id' => $teacher->id,
            ]);
            $sync = $db->prepare('UPDATE users SET name = :name, email = :email WHERE id = :id AND deleted_at IS NULL');
            $sync->execute([
                ':name' => trim($teacher->first_name . ' ' . $teacher->last_name),
                ':email' => $teacher->email,
                ':id' => $teacher->user_id,
            ]);
            echo json_encode(['success' => true, 'message' => 'Enseignant mis à jour.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la modification."]);
        }
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        // La suppression physique casserait la paie, les cours et les
        // historiques. La suppression de compte centralisée neutralise les
        // accès et conserve les données métier.
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => "Supprimez le compte depuis Gestion des utilisateurs afin de révoquer ses accès tout en conservant l'historique professionnel.",
        ]);
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    error_log("PDOException in teachers.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>
