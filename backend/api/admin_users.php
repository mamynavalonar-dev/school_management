<?php
/**
 * admin_users.php – admin‑only user management endpoint
 * ----------------------------------------------------
 * This file must output ONLY JSON. Any HTML, whitespace,
 * or PHP notice will break the frontend's JSON parsing.
 */
// -----------------------------------------------------------------
// 1. Suppress any accidental output from PHP errors/notices
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

// 2. Start output buffering – guarantees nothing leaks before JSON
ob_start();

require_once '../config/database.php';
require_once '../config/cors.php';
applyCorsOrigin();
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    if (ob_get_level() > 0) ob_end_flush();
    exit();
}

require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';
require_once '../config/admin_guard.php';
require_once '../config/feature_permissions.php';
require_once '../config/academic_progress.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);
// Handle case where data is sent as form-encoded instead of JSON
if ($input === null && !empty($_POST)) {
    $input = $_POST;
}

// Get user ID from URL if present (PATH_INFO ex: /api/admin_users.php/123) ou via ?id= (query string)
$path = explode('/', trim($_SERVER['PATH_INFO'] ?? '', '/'));
$userId = null;
if (isset($path[0]) && is_numeric($path[0])) {
    $userId = (int)$path[0];
} elseif (isset($_GET['id']) && is_numeric($_GET['id'])) {
    $userId = (int)$_GET['id'];
}

if ($method === 'GET') {
    if ($userId !== null) {
        // Get specific user
        getUser($db, $userId);
    } else {
        // Get all users with optional filtering
        getUsers($db, $_GET);
    }
} elseif ($method === 'POST') {
    // Create new user
    createUser($db, $input);
} elseif ($method === 'PUT') {
    // Update existing user
    if ($userId === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ID utilisateur requis']);
        return;
    }
    updateUser($db, $userId, $input);
} elseif ($method === 'DELETE') {
    // Delete user
    if ($userId === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'ID utilisateur requis']);
        return;
    }
    deleteUser($db, $userId);
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Méthode non autorisée']);
}

/**
 * Sépare "name" en first_name / last_name (au premier espace),
 * pour remplir les colonnes NOT NULL de teachers/students.
 */
function splitName($fullName) {
    $parts = explode(' ', trim($fullName), 2);
    return [
        'first_name' => $parts[0],
        'last_name'  => $parts[1] ?? $parts[0], // fallback si un seul mot fourni
    ];
}

/**
 * Crée la ligne "students" liée à un nouvel utilisateur (role = student).
 * Sans ça, /api/student_dashboard.php répond 404
 * "Aucun profil étudiant associé à ce compte."
 */
function createStudentProfile($db, $userId, $fullName, $email, $profile = []) {
    $names = splitName($fullName);
    $firstName = trim((string)($profile['first_name'] ?? $names['first_name'])) ?: $names['first_name'];
    $lastName = trim((string)($profile['last_name'] ?? $names['last_name'])) ?: $names['last_name'];

    // Génère un numéro d'étudiant du type STU20260001
    $year = date('Y');
    $stmt = $db->prepare(
        "SELECT MAX(CAST(SUBSTRING(student_number, -4) AS UNSIGNED)) as max_num
         FROM students WHERE student_number LIKE :pattern"
    );
    $pattern = "STU{$year}%";
    $stmt->bindParam(':pattern', $pattern);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $nextNum = ($row['max_num'] ?? 0) + 1;
    $studentNumber = "STU{$year}" . str_pad($nextNum, 4, '0', STR_PAD_LEFT);

    $query = "INSERT INTO students
              (user_id, student_number, first_name, last_name, email, phone, birth_date, birth_place,
               address, city, postal_code, gender, nationality, emergency_contact_name,
               emergency_contact_phone, photo_url, status)
              VALUES
              (:user_id, :student_number, :first_name, :last_name, :email, :phone, :birth_date, :birth_place,
               :address, :city, :postal_code, :gender, :nationality, :emergency_contact_name,
               :emergency_contact_phone, :photo_url, :status)";
    $stmt = $db->prepare($query);
    $stmt->execute([
        ':user_id' => $userId, ':student_number' => $studentNumber,
        ':first_name' => $firstName, ':last_name' => $lastName, ':email' => $email,
        ':phone' => nullableProfileValue($profile, 'phone'), ':birth_date' => validatedDate($profile, 'birth_date'),
        ':birth_place' => nullableProfileValue($profile, 'birth_place'), ':address' => nullableProfileValue($profile, 'address'),
        ':city' => nullableProfileValue($profile, 'city'), ':postal_code' => nullableProfileValue($profile, 'postal_code'),
        ':gender' => validatedGender($profile), ':nationality' => nullableProfileValue($profile, 'nationality'),
        ':emergency_contact_name' => nullableProfileValue($profile, 'emergency_contact_name'),
        ':emergency_contact_phone' => nullableProfileValue($profile, 'emergency_contact_phone'),
        ':photo_url' => validatedPhotoUrl($profile),
        ':status' => in_array($profile['status'] ?? '', ['active', 'inactive', 'graduated'], true) ? $profile['status'] : 'active',
    ]);
}

/**
 * Crée la ligne "teachers" liée à un nouvel utilisateur (role = teacher).
 * Sans ça, /api/teacher_dashboard.php répond 404
 * "Aucun profil enseignant associé à ce compte."
 */
function createTeacherProfile($db, $userId, $fullName, $email, $profile = []) {
    $names = splitName($fullName);
    $firstName = trim((string)($profile['first_name'] ?? $names['first_name'])) ?: $names['first_name'];
    $lastName = trim((string)($profile['last_name'] ?? $names['last_name'])) ?: $names['last_name'];

    // Génère un numéro d'enseignant du type TEA20260001
    $year = date('Y');
    $stmt = $db->prepare(
        "SELECT MAX(CAST(SUBSTRING(teacher_number, -4) AS UNSIGNED)) as max_num
         FROM teachers WHERE teacher_number LIKE :pattern"
    );
    $pattern = "TEA{$year}%";
    $stmt->bindParam(':pattern', $pattern);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $nextNum = ($row['max_num'] ?? 0) + 1;
    $teacherNumber = "TEA{$year}" . str_pad($nextNum, 4, '0', STR_PAD_LEFT);

    $query = "INSERT INTO teachers
              (user_id, teacher_number, first_name, last_name, email, phone, birth_date, gender,
               address, city, postal_code, nationality, profession, diploma, hire_date, department,
               title, specialization, salary, contract_type, contract_start_date, contract_end_date,
               photo_url, status)
              VALUES
              (:user_id, :teacher_number, :first_name, :last_name, :email, :phone, :birth_date, :gender,
               :address, :city, :postal_code, :nationality, :profession, :diploma, :hire_date, :department,
               :title, :specialization, :salary, :contract_type, :contract_start_date, :contract_end_date,
               :photo_url, :status)";
    $stmt = $db->prepare($query);
    $stmt->execute([
        ':user_id' => $userId, ':teacher_number' => $teacherNumber,
        ':first_name' => $firstName, ':last_name' => $lastName, ':email' => $email,
        ':phone' => nullableProfileValue($profile, 'phone'), ':birth_date' => validatedDate($profile, 'birth_date'),
        ':gender' => validatedGender($profile), ':address' => nullableProfileValue($profile, 'address'),
        ':city' => nullableProfileValue($profile, 'city'), ':postal_code' => nullableProfileValue($profile, 'postal_code'),
        ':nationality' => nullableProfileValue($profile, 'nationality'), ':profession' => nullableProfileValue($profile, 'profession'),
        ':diploma' => nullableProfileValue($profile, 'diploma'), ':hire_date' => validatedDate($profile, 'hire_date'),
        ':department' => nullableProfileValue($profile, 'department'), ':title' => nullableProfileValue($profile, 'title'),
        ':specialization' => nullableProfileValue($profile, 'specialization'),
        ':salary' => is_numeric($profile['salary'] ?? null) ? max(0, (float)$profile['salary']) : null,
        ':contract_type' => nullableProfileValue($profile, 'contract_type'),
        ':contract_start_date' => validatedDate($profile, 'contract_start_date'),
        ':contract_end_date' => validatedDate($profile, 'contract_end_date'),
        ':photo_url' => validatedPhotoUrl($profile),
        ':status' => in_array($profile['status'] ?? '', ['active', 'inactive', 'on_leave'], true) ? $profile['status'] : 'active',
    ]);
}

function nullableProfileValue($profile, $key) {
    $value = trim((string)($profile[$key] ?? ''));
    return $value === '' ? null : $value;
}

function validatedGender($profile) {
    $value = nullableProfileValue($profile, 'gender');
    if ($value === null) return null;
    return in_array($value, ['male', 'female', 'other'], true) ? $value : null;
}

function validatedPhotoUrl($profile) {
    $value = nullableProfileValue($profile, 'photo_url');
    if ($value === null) return null;
    if (strlen($value) > 500) return null;
    if (filter_var($value, FILTER_VALIDATE_URL) && preg_match('#^https?://#i', $value)) return $value;
    if (preg_match('#^/uploads/profile-images/[A-Za-z0-9._-]+$#', $value)) return $value;
    return null;
}

function validatedDate($profile, $key) {
    $value = nullableProfileValue($profile, $key);
    if ($value === null) return null;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    return $date && $date->format('Y-m-d') === $value ? $value : null;
}

function profileValidationError($profile, $role) {
    if (!in_array($role, ['student', 'teacher'], true) || !is_array($profile)) return null;
    if (nullableProfileValue($profile, 'gender') !== null && validatedGender($profile) === null) {
        return 'Valeur de sexe invalide.';
    }
    foreach (['birth_date', 'hire_date', 'contract_start_date', 'contract_end_date'] as $field) {
        if (nullableProfileValue($profile, $field) !== null && validatedDate($profile, $field) === null) {
            return 'Une date du profil est invalide.';
        }
    }
    if (nullableProfileValue($profile, 'photo_url') !== null && validatedPhotoUrl($profile) === null) {
        return 'Adresse de photo invalide. Utilisez une adresse http(s) ou une photo importée.';
    }
    if ($role === 'teacher') {
        $start = validatedDate($profile, 'contract_start_date');
        $end = validatedDate($profile, 'contract_end_date');
        if ($start && $end && $end < $start) return 'La fin du contrat ne peut pas précéder son début.';
        if (nullableProfileValue($profile, 'salary') !== null
            && (!is_numeric($profile['salary']) || (float)$profile['salary'] < 0)) {
            return 'Le salaire doit être un montant positif ou nul.';
        }
    }
    return null;
}

function ensureUserRoleProfile($db, $userId, $role, $fullName, $email, $profile = []) {
    if ($role === 'student') {
        $stmt = $db->prepare('SELECT id FROM students WHERE user_id = :user_id');
        $stmt->execute([':user_id' => $userId]);
        if (!$stmt->fetchColumn()) {
            createStudentProfile($db, $userId, $fullName, $email, $profile);
        }
    } elseif ($role === 'teacher') {
        $stmt = $db->prepare('SELECT id FROM teachers WHERE user_id = :user_id');
        $stmt->execute([':user_id' => $userId]);
        if (!$stmt->fetchColumn()) {
            createTeacherProfile($db, $userId, $fullName, $email, $profile);
        }
    }
}

function updateRoleProfile($db, $userId, $role, $fullName, $email, $profile) {
    $names = splitName($fullName);
    $firstName = trim((string)($profile['first_name'] ?? $names['first_name'])) ?: $names['first_name'];
    $lastName = trim((string)($profile['last_name'] ?? $names['last_name'])) ?: $names['last_name'];
    if ($role === 'student') {
        $stmt = $db->prepare('UPDATE students SET first_name=:first_name,last_name=:last_name,email=:email,phone=:phone,birth_date=:birth_date,birth_place=:birth_place,address=:address,city=:city,postal_code=:postal_code,gender=:gender,nationality=:nationality,emergency_contact_name=:emergency_name,emergency_contact_phone=:emergency_phone,photo_url=:photo,status=:status WHERE user_id=:user_id');
        $stmt->execute([
            ':first_name'=>$firstName, ':last_name'=>$lastName, ':email'=>$email,
            ':phone'=>nullableProfileValue($profile,'phone'), ':birth_date'=>validatedDate($profile,'birth_date'),
            ':birth_place'=>nullableProfileValue($profile,'birth_place'), ':address'=>nullableProfileValue($profile,'address'),
            ':city'=>nullableProfileValue($profile,'city'), ':postal_code'=>nullableProfileValue($profile,'postal_code'),
            ':gender'=>validatedGender($profile), ':nationality'=>nullableProfileValue($profile,'nationality'),
            ':emergency_name'=>nullableProfileValue($profile,'emergency_contact_name'), ':emergency_phone'=>nullableProfileValue($profile,'emergency_contact_phone'),
            ':photo'=>validatedPhotoUrl($profile),
            ':status'=>in_array($profile['status'] ?? '', ['active','inactive','graduated'], true) ? $profile['status'] : 'active',
            ':user_id'=>$userId,
        ]);
    } elseif ($role === 'teacher') {
        $stmt = $db->prepare('UPDATE teachers SET first_name=:first_name,last_name=:last_name,email=:email,phone=:phone,birth_date=:birth_date,gender=:gender,address=:address,city=:city,postal_code=:postal_code,nationality=:nationality,profession=:profession,diploma=:diploma,hire_date=:hire_date,department=:department,title=:title,specialization=:specialization,salary=:salary,contract_type=:contract_type,contract_start_date=:contract_start,contract_end_date=:contract_end,photo_url=:photo,status=:status WHERE user_id=:user_id');
        $stmt->execute([
            ':first_name'=>$firstName, ':last_name'=>$lastName, ':email'=>$email,
            ':phone'=>nullableProfileValue($profile,'phone'), ':birth_date'=>validatedDate($profile,'birth_date'),
            ':gender'=>validatedGender($profile), ':address'=>nullableProfileValue($profile,'address'),
            ':city'=>nullableProfileValue($profile,'city'), ':postal_code'=>nullableProfileValue($profile,'postal_code'),
            ':nationality'=>nullableProfileValue($profile,'nationality'), ':profession'=>nullableProfileValue($profile,'profession'),
            ':diploma'=>nullableProfileValue($profile,'diploma'), ':hire_date'=>validatedDate($profile,'hire_date'),
            ':department'=>nullableProfileValue($profile,'department'), ':title'=>nullableProfileValue($profile,'title'),
            ':specialization'=>nullableProfileValue($profile,'specialization'),
            ':salary'=>is_numeric($profile['salary'] ?? null) ? max(0,(float)$profile['salary']) : null,
            ':contract_type'=>nullableProfileValue($profile,'contract_type'), ':contract_start'=>validatedDate($profile,'contract_start_date'),
            ':contract_end'=>validatedDate($profile,'contract_end_date'), ':photo'=>validatedPhotoUrl($profile),
            ':status'=>in_array($profile['status'] ?? '', ['active','inactive','on_leave'], true) ? $profile['status'] : 'active',
            ':user_id'=>$userId,
        ]);
    }
}

function synchronizeUserProfiles($db, $userId, $fullName, $email, $userStatus, $role) {
    $names = splitName($fullName);
    $studentStatus = $userStatus === 'active' && $role === 'student' ? 'active' : 'inactive';
    $teacherStatus = $userStatus === 'active' && $role === 'teacher' ? 'active' : 'inactive';

    $stmt = $db->prepare('
        UPDATE students
        SET first_name = :first_name, last_name = :last_name,
            email = :email, status = :status
        WHERE user_id = :user_id
    ');
    $stmt->execute([
        ':first_name' => $names['first_name'],
        ':last_name' => $names['last_name'],
        ':email' => $email,
        ':status' => $studentStatus,
        ':user_id' => $userId,
    ]);

    $stmt = $db->prepare('
        UPDATE teachers
        SET first_name = :first_name, last_name = :last_name,
            email = :email, status = :status
        WHERE user_id = :user_id
    ');
    $stmt->execute([
        ':first_name' => $names['first_name'],
        ':last_name' => $names['last_name'],
        ':email' => $email,
        ':status' => $teacherStatus,
        ':user_id' => $userId,
    ]);
}

function getUsers($db, $filters = []) {
    try {
        $whereConditions = ['deleted_at IS NULL'];
        $params = [];

        // Filter by role if specified
        if (!empty($filters['role'])) {
            $whereConditions[] = "role = :role";
            $params[':role'] = $filters['role'];
        }

        // Filter by search term (name, username or email)
        if (!empty($filters['search'])) {
            $whereConditions[] = "(name LIKE :search OR username LIKE :search OR email LIKE :search)";
            $params[':search'] = "%" . $filters['search'] . "%";
        }

        // Filter by status (active/inactive)
        if (!empty($filters['status'])) {
            $whereConditions[] = "status = :status";
            $params[':status'] = $filters['status'];
        }

        $whereClause = !empty($whereConditions) ? "WHERE " . implode(" AND ", $whereConditions) : "";

        $query = "SELECT id, name, username, email, role, status, created_at FROM users {$whereClause} ORDER BY created_at DESC";
        $stmt = $db->prepare($query);

        $stmt->execute($params);
        $users = $stmt->fetchAll();

        // Remove password hash from results (shouldn't be there anyway, but just in case)
        foreach ($users as &$user) {
            unset($user['password']);
        }

        echo json_encode([
            'success' => true,
            'data' => $users,
            'count' => count($users)
        ]);
    } catch (PDOException $e) {
        error_log('Admin users listing failure: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => "Erreur lors de la récupération des utilisateurs"
        ]);
    }
}

function getUser($db, $userId) {
    try {
        $query = "SELECT id, name, username, email, role, status, created_at FROM users WHERE id = :id AND deleted_at IS NULL";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':id', $userId, PDO::PARAM_INT);
        $stmt->execute();
        $user = $stmt->fetch();

        if (!$user) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'message' => 'Utilisateur non trouvé'
            ]);
            return;
        }

        unset($user['password']); // Remove password hash if present

        $user['profile'] = null;
        if ($user['role'] === 'student') {
            $profileStmt = $db->prepare('SELECT first_name,last_name,phone,birth_date,birth_place,address,city,postal_code,gender,nationality,emergency_contact_name,emergency_contact_phone,photo_url,status FROM students WHERE user_id = :user_id');
            $profileStmt->execute([':user_id' => $userId]);
            $user['profile'] = $profileStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        } elseif ($user['role'] === 'teacher') {
            $profileStmt = $db->prepare('SELECT first_name,last_name,phone,birth_date,gender,address,city,postal_code,nationality,profession,diploma,hire_date,department,title,specialization,salary,contract_type,contract_start_date,contract_end_date,photo_url,status FROM teachers WHERE user_id = :user_id');
            $profileStmt->execute([':user_id' => $userId]);
            $user['profile'] = $profileStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }
        $user['permissions'] = loadFeaturePermissions($db, (int)$userId, $user['role']);

        echo json_encode([
            'success' => true,
            'data' => $user
        ]);
    } catch (PDOException $e) {
        error_log('Admin user read failure: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => "Erreur lors de la récupération de l'utilisateur"
        ]);
    }
}

function createUser($db, $data) {
    // Validation des champs obligatoires.
    if (empty($data['username']) || empty($data['email']) || empty($data['password'])) {
        http_response_code(400);
        echo json_encode(['success'=>false,'message'=>"Nom d'utilisateur, email et mot de passe requis"]);
        return;
    }
    $username = strtolower(trim((string)$data['username']));
    if (!preg_match('/^[a-z0-9._-]{3,50}$/', $username)) {
        http_response_code(400);
        echo json_encode(['success'=>false,'message'=>"Nom d'utilisateur invalide : 3 à 50 caractères, lettres, chiffres, point, tiret ou underscore"]);
        return;
    }
    // Le nom peut venir sous la forme "name" ou "first_name"/"last_name"
    $name = trim($data['name'] ?? ($data['first_name'] ?? '').' '.($data['last_name'] ?? ''));
    if ($name === '') {
        http_response_code(400);
        echo json_encode(['success'=>false,'message'=>'Le nom complet est requis']);
        return;
    }
    // Validation email
    if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success'=>false,'message'=>'Email invalide']);
        return;
    }
    if (mb_strlen((string)$data['password']) < 12) {
        http_response_code(400);
        echo json_encode(['success'=>false,'message'=>'Le mot de passe doit contenir au moins 12 caractères']);
        return;
    }
    // Validation du rôle
    $allowedRoles = ['student','teacher','admin','directeur'];
    $role = (string)($data['role'] ?? '');
    if (!in_array($role, $allowedRoles, true)) {
        http_response_code(400);
        echo json_encode(['success'=>false,'message'=>'Rôle invalide']);
        return;
    }
    if (($_SESSION['user_role'] ?? '') === 'directeur' && !in_array($role, ['student', 'teacher'], true)) {
        http_response_code(403);
        echo json_encode(['success'=>false,'message'=>'Un directeur peut créer uniquement des comptes étudiant ou enseignant']);
        return;
    }
    // Validation du statut
    $allowedStatuses = ['active','inactive','suspended'];
    $status = isset($data['status']) && in_array($data['status'], $allowedStatuses, true)
              ? $data['status']
              : 'active';
    $profile = is_array($data['profile'] ?? null) ? $data['profile'] : [];
    if ($profileError = profileValidationError($profile, $role)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => $profileError]);
        return;
    }

    try {
        // Vérifier l'unicité du nom d'utilisateur et de l'e-mail.
        $checkUsername = $db->prepare("SELECT id FROM users WHERE username = :username");
        $checkUsername->execute([':username' => $username]);
        if ($checkUsername->fetchColumn() !== false) {
            http_response_code(409);
            echo json_encode(['success'=>false,'message'=>"Ce nom d'utilisateur est déjà utilisé"]);
            return;
        }
        $check = $db->prepare("SELECT id FROM users WHERE email = :email");
        $check->bindParam(':email', $data['email']);
        $check->execute();
        if ($check->fetchColumn() !== false) {
            http_response_code(409);
            echo json_encode(['success'=>false,'message'=>'Cet email est déjà utilisé']);
            return;
        }

        $db->beginTransaction();

        // Insertion de l’utilisateur
        $insertUser = $db->prepare(
            "INSERT INTO users (name, username, email, password, role, status)
             VALUES (:name, :username, :email, :password, :role, :status)"
        );
        $hashed = password_hash($data['password'], PASSWORD_DEFAULT);
        $insertUser->bindParam(':name', $name);
        $insertUser->bindParam(':username', $username);
        $insertUser->bindParam(':email', $data['email']);
        $insertUser->bindParam(':password', $hashed);
        $insertUser->bindParam(':role', $role);
        $insertUser->bindParam(':status', $status);
        $insertUser->execute();
        $userId = $db->lastInsertId();

        // Création du profil associé (seulement pour student/teacher)
        if ($role === 'student') {
            createStudentProfile($db, $userId, $name, $data['email'], $profile);
        } elseif ($role === 'teacher') {
            createTeacherProfile($db, $userId, $name, $data['email'], $profile);
        }
        if ($status !== 'active') {
            synchronizeUserProfiles($db, $userId, $name, $data['email'], $status, $role);
        }
        saveFeaturePermissions($db, (int)$userId, $role, is_array($data['permissions'] ?? null) ? $data['permissions'] : [], (int)($_SESSION['user_id'] ?? 0) ?: null);

        $db->commit();

        echo json_encode([
            'success'=>true,
            'message'=>'Utilisateur créé avec succès',
            'data'=>[
                'id'=>$userId,
                'name'=>$name,
                'username'=>$username,
                'email'=>$data['email'],
                'role'=>$role,
                'status'=>$status
            ]
        ]);
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        error_log('Admin user creation failure: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success'=>false,
            'message'=>'Erreur lors de la création de l\'utilisateur'
        ]);
    }
}

function updateUser($db, $userId, $data) {
    try {
        $stmt = $db->prepare('SELECT id, name, username, email, role, status FROM users WHERE id = :id AND deleted_at IS NULL');
        $stmt->execute([':id' => $userId]);
        $current = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$current) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Utilisateur non trouvé']);
            return;
        }
        if (($_SESSION['user_role'] ?? '') === 'directeur' && in_array($current['role'], ['admin', 'directeur'], true)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Un directeur ne peut pas modifier un compte administrateur ou directeur']);
            return;
        }

        $name = trim((string)($data['name'] ?? $current['name']));
        $username = strtolower(trim((string)($data['username'] ?? $current['username'])));
        $email = trim((string)($data['email'] ?? $current['email']));
        $role = $data['role'] ?? $current['role'];
        $status = $data['status'] ?? $current['status'];
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Nom ou email invalide']);
            return;
        }
        if (!preg_match('/^[a-z0-9._-]{3,50}$/', $username)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => "Nom d'utilisateur invalide : 3 à 50 caractères, lettres, chiffres, point, tiret ou underscore"]);
            return;
        }
        if (!in_array($role, ['student', 'teacher', 'admin', 'directeur'], true)
            || !in_array($status, ['active', 'inactive', 'suspended'], true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Rôle ou statut invalide']);
            return;
        }
        if (($_SESSION['user_role'] ?? '') === 'directeur' && !in_array($role, ['student', 'teacher'], true)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Un directeur ne peut pas attribuer un rôle administrateur ou directeur']);
            return;
        }
        $profileProvided = array_key_exists('profile', $data) && is_array($data['profile']);
        $profile = $profileProvided ? $data['profile'] : [];
        if ($profileProvided && ($profileError = profileValidationError($profile, $role))) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => $profileError]);
            return;
        }
        $isOwnAccount = (int)($_SESSION['user_id'] ?? 0) === (int)$userId;
        if ($isOwnAccount && ($role !== $current['role'] || $status !== 'active')) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'Vous ne pouvez ni changer le rôle ni désactiver le compte actuellement connecté',
            ]);
            return;
        }

        $usernameStmt = $db->prepare('SELECT id FROM users WHERE username = :username AND id <> :id');
        $usernameStmt->execute([':username' => $username, ':id' => $userId]);
        if ($usernameStmt->fetchColumn()) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => "Ce nom d'utilisateur est déjà utilisé par un autre utilisateur"]);
            return;
        }

        $emailStmt = $db->prepare('SELECT id FROM users WHERE email = :email AND id <> :id');
        $emailStmt->execute([':email' => $email, ':id' => $userId]);
        if ($emailStmt->fetchColumn()) {
            http_response_code(409);
            echo json_encode(['success' => false, 'message' => 'Cet email est déjà utilisé par un autre utilisateur']);
            return;
        }

        $passwordChanged = isset($data['password']) && $data['password'] !== '';
        if ($passwordChanged && mb_strlen((string)$data['password']) < 12) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Le mot de passe doit contenir au moins 12 caractères']);
            return;
        }

        $db->beginTransaction();
        $params = [
            ':id' => $userId,
            ':name' => $name,
            ':username' => $username,
            ':email' => $email,
            ':role' => $role,
            ':status' => $status,
        ];
        $passwordSql = '';
        if ($passwordChanged) {
            $passwordSql = ', password = :password';
            $params[':password'] = password_hash((string)$data['password'], PASSWORD_DEFAULT);
        }

        $stmt = $db->prepare("
            UPDATE users
            SET name = :name, username = :username, email = :email, role = :role, status = :status{$passwordSql}
            WHERE id = :id
        ");
        $stmt->execute($params);

        $roleChanged = $role !== $current['role'];
        ensureUserRoleProfile($db, $userId, $role, $name, $email, $profile);
        synchronizeUserProfiles($db, $userId, $name, $email, $status, $role);
        // Une mise à jour partielle du compte (statut, mot de passe, etc.) ne
        // doit pas effacer les coordonnées professionnelles/scolaires déjà
        // enregistrées. Le profil détaillé n'est réécrit que s'il est fourni.
        if ($profileProvided) {
            updateRoleProfile($db, $userId, $role, $name, $email, $profile);
        }
        if ($status !== 'active') {
            synchronizeUserProfiles($db, $userId, $name, $email, $status, $role);
        }
        if ($roleChanged || (array_key_exists('permissions', $data) && is_array($data['permissions']))) {
            saveFeaturePermissions(
                $db,
                (int)$userId,
                $role,
                is_array($data['permissions'] ?? null) ? $data['permissions'] : [],
                (int)($_SESSION['user_id'] ?? 0) ?: null
            );
        }

        if ($role !== $current['role'] || $status !== $current['status'] || $passwordChanged) {
            $tokenStmt = $db->prepare('DELETE FROM auth_tokens WHERE user_id = :user_id');
            $tokenStmt->execute([':user_id' => $userId]);
        }

        // Une réactivation d'un compte étudiant suspendu remet aussi à zéro
        // le verrou académique. Cette opération n'est accessible qu'à
        // l'administrateur ou à la direction via cet endpoint.
        if ($role === 'student' && $current['status'] === 'suspended' && $status === 'active') {
            $studentStmt = $db->prepare('SELECT id FROM students WHERE user_id=:user_id LIMIT 1');
            $studentStmt->execute([':user_id' => $userId]);
            $studentId = (int)($studentStmt->fetchColumn() ?: 0);
            if ($studentId > 0) reactivateAcademicStudent($db, $studentId, (int)($_SESSION['user_id'] ?? 0));
        }

        $db->commit();
        echo json_encode([
            'success' => true,
            'message' => 'Utilisateur et profil associés mis à jour avec succès',
        ]);
    } catch (PDOException $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('PDOException in admin_users update: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => "Erreur lors de la mise à jour de l'utilisateur"]);
    }
}

function deleteUser($db, $userId) {
    try {
        if (($_SESSION['user_role'] ?? '') !== 'admin') {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Seul un administrateur peut supprimer un compte']);
            return;
        }
        // Prevent self-deletion
        if (!empty($_SESSION['user_id']) && $_SESSION['user_id'] == $userId) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'Vous ne pouvez pas supprimer votre propre compte'
            ]);
            return;
        }

        // Check if user exists
        $checkQuery = "SELECT id, role FROM users WHERE id = :id AND deleted_at IS NULL";
        $checkStmt = $db->prepare($checkQuery);
        $checkStmt->bindParam(':id', $userId, PDO::PARAM_INT);
        $checkStmt->execute();

        $targetUser = $checkStmt->fetch(PDO::FETCH_ASSOC);
        if (!$targetUser) {
            http_response_code(404);
            echo json_encode([
                'success' => false,
                'message' => 'Utilisateur non trouvé'
            ]);
            return;
        }

        // Une suppression physique casserait les historiques scolaires, la
        // paie, les messages et les appels liés à ce compte. On neutralise le
        // compte et ses jetons, tout en conservant les dossiers métier.
        $db->beginTransaction();

        $stmt = $db->prepare("UPDATE teachers SET status = 'inactive' WHERE user_id = :id");
        $stmt->execute([':id' => $userId]);
        $stmt = $db->prepare("UPDATE students SET status = 'inactive' WHERE user_id = :id");
        $stmt->execute([':id' => $userId]);

        $stmt = $db->prepare('DELETE FROM auth_tokens WHERE user_id = :id');
        $stmt->execute([':id' => $userId]);
        $stmt = $db->prepare('DELETE FROM ws_tickets WHERE user_id = :id');
        $stmt->execute([':id' => $userId]);
        // La première suppression est réversible : on conserve le nom, l'email,
        // le mot de passe et les permissions pour permettre une restauration
        // fidèle depuis la Corbeille. Les jetons actifs sont néanmoins révoqués.
        $stmt = $db->prepare("
            UPDATE users
            SET status = 'inactive', deleted_at = UTC_TIMESTAMP(), deleted_by = :deleted_by
            WHERE id = :id AND deleted_at IS NULL
        ");
        $stmt->execute([
            ':deleted_by' => (int)$_SESSION['user_id'],
            ':id' => $userId,
        ]);

        $db->commit();

        echo json_encode([
            'success' => true,
            'message' => 'Compte placé dans la corbeille et accès révoqués. Il peut être restauré avant purge définitive.'
        ]);
    } catch (PDOException $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('Admin user deletion failure: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Erreur lors de la suppression de l\'utilisateur'
        ]);
    }
}

// End of buffering – send the buffered output
if (ob_get_level() > 0) ob_end_flush();
?>
