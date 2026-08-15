<?php
require_once '../config/database.php';
require_once '../models/Student.php';

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
// GET : admin/directeur/teacher voient tous les étudiants ; student ne voit que son propre profil
// POST/PUT/DELETE : gestion administrative, réservée au personnel (admin/directeur/teacher)
$allowedRoles = [];
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $allowedRoles = ['admin', 'directeur', 'teacher', 'student'];
} else {
    $allowedRoles = ['admin', 'directeur'];
}
if (!in_array($_SESSION['user_role'], $allowedRoles)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès refusé - rôle non autorisé']);
    exit();
}

$database = new Database();
$db = $database->getConnection();
$student = new Student($db);

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);

function validateStudentPayload($data) {
    if (!is_array($data)) return 'Corps de requête invalide.';
    if (array_key_exists('gender', $data) && trim((string)$data['gender']) !== ''
        && !in_array($data['gender'], ['male', 'female', 'other'], true)) {
        return 'Valeur de sexe invalide.';
    }
    if (array_key_exists('status', $data) && !in_array($data['status'], ['active', 'inactive', 'graduated'], true)) {
        return 'Statut étudiant invalide.';
    }
    if (array_key_exists('birth_date', $data) && trim((string)$data['birth_date']) !== '') {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', (string)$data['birth_date']);
        if (!$date || $date->format('Y-m-d') !== $data['birth_date']) return 'Date de naissance invalide.';
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
        if ($_SESSION['user_role'] === 'student') {
            // Un étudiant ne voit que son propre profil
            $stmt = $student->readByUserId($_SESSION['user_id']);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'data' => $row ? [$row] : []]);
        } elseif ($_SESSION['user_role'] === 'teacher') {
            // Un enseignant ne voit que les étudiants inscrits dans les
            // niveaux/spécialisations de ses propres créneaux.
            $stmt = $db->prepare("
                SELECT DISTINCT s.id, s.user_id, s.student_number,
                       s.first_name, s.last_name, s.email, s.status
                FROM students s
                INNER JOIN enrollments e
                    ON e.student_id = s.id AND e.status = 'Enrolled'
                INNER JOIN planning_schedules ps
                    ON ps.level_id = e.level_id
                   AND COALESCE(ps.specialization_id, 0) = COALESCE(e.specialization_id, 0)
                INNER JOIN teachers t ON t.id = ps.teacher_id
                WHERE t.user_id = :user_id
                ORDER BY s.last_name, s.first_name
            ");
            $stmt->execute([':user_id' => $_SESSION['user_id']]);
            echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        } else {
            // Personnel : liste complète de tous les étudiants
            $stmt = $student->readAll();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode(['success' => true, 'data' => $rows]);
        }
    } elseif ($method === 'POST') {
        if ($validationError = validateStudentPayload($input)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => $validationError]);
            exit();
        }
        if (!$input || !isset($input['user_id'], $input['first_name'], $input['last_name'], $input['email'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Champs obligatoires manquants.']);
            exit();
        }
        if (!filter_var($input['email'], FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Email invalide.']);
            exit();
        }
        // Optional validation (phone, etc)
        $student->user_id = $input['user_id'];
        $student->first_name = $input['first_name'];
        $student->last_name  = $input['last_name'];
        $student->email      = $input['email'];
        $student->phone      = $input['phone'] ?? null;
        $student->birth_date = $input['birth_date'] ?? null;
        $student->address    = $input['address'] ?? null;
        $student->city       = $input['city'] ?? null;
        $student->postal_code = $input['postal_code'] ?? null;
        $student->gender     = $input['gender'] ?? null;
        $student->nationality = $input['nationality'] ?? null;
        $student->emergency_contact_name = $input['emergency_contact_name'] ?? null;
        $student->emergency_contact_phone = $input['emergency_contact_phone'] ?? null;
        $student->status     = $input['status']     ?? 'active';

        if ($student->create()) {
            http_response_code(201);
            echo json_encode(['success' => true, 'message' => 'Étudiant créé avec succès.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la création de l'étudiant."]);
        }
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        if ($validationError = validateStudentPayload($input)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => $validationError]);
            exit();
        }
        $student->id = intval($_GET['id']);
        $studentRow = $student->read_single();
        if (!$studentRow) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => "Étudiant non trouvé."]);
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
                $duplicate->execute([':email' => trim($input['email']), ':user_id' => $student->user_id]);
                if ($duplicate->fetchColumn()) {
                    http_response_code(409);
                    echo json_encode(['success' => false, 'message' => 'Cette adresse e-mail est déjà utilisée.']);
                    exit();
                }
            }
            // Le rattachement au compte est immuable ici. Un changement de
            // rôle ou de compte passe par la gestion unifiée des utilisateurs.
            foreach (['first_name', 'last_name', 'email', 'phone', 'birth_date', 'address', 'city', 'postal_code', 'gender', 'nationality', 'emergency_contact_name', 'emergency_contact_phone', 'status'] as $k) {
                if (isset($input[$k])) $student->$k = $input[$k];
            }
        }
        if ($student->update()) {
            if (array_key_exists('birth_place', $input) || array_key_exists('photo_url', $input)) {
                $extra = $db->prepare('UPDATE students SET birth_place = :birth_place, photo_url = :photo_url WHERE id = :id');
                $extra->execute([
                    ':birth_place' => array_key_exists('birth_place', $input)
                        ? (trim((string)$input['birth_place']) ?: null)
                        : ($studentRow['birth_place'] ?? null),
                    ':photo_url' => array_key_exists('photo_url', $input)
                        ? (trim((string)$input['photo_url']) ?: null)
                        : ($studentRow['photo_url'] ?? null),
                    ':id' => $student->id,
                ]);
            }
            $sync = $db->prepare('UPDATE users SET name = :name, email = :email WHERE id = :id AND deleted_at IS NULL');
            $sync->execute([
                ':name' => trim($student->first_name . ' ' . $student->last_name),
                ':email' => $student->email,
                ':id' => $student->user_id,
            ]);
            echo json_encode(['success' => true, 'message' => 'Étudiant mis à jour.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la mise à jour de l'étudiant."]);
        }
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        // Une suppression directe du profil laisserait un compte actif sans
        // dossier étudiant et casserait les références d'inscription.
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => "Supprimez le compte depuis Gestion des utilisateurs afin de révoquer ses accès tout en conservant l'historique scolaire.",
        ]);
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    error_log("PDOException in student.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>
