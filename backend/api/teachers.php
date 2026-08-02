<?php
header("Access-Control-Allow-Origin: http://localhost:5174");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/auth_guard.php';

require_once '../models/Teacher.php';

$database = new Database();
$db = $database->getConnection();
$teacher = new Teacher($db);

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);

try {
    if ($method === 'GET') {
        // Lister tous les enseignants
        $stmt = $teacher->readAll();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $rows]);
    } elseif ($method === 'POST') {
        $required = ['first_name', 'last_name', 'email'];
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
        $teacher->teacher_number = $input['teacher_number'] ?? null;
        $teacher->first_name = $input['first_name'];
        $teacher->last_name  = $input['last_name'];
        $teacher->email      = $input['email'];
        $teacher->phone      = $input['phone'] ?? null;
        $teacher->birth_date = $input['birth_date'] ?? null;
        $teacher->address    = $input['address'] ?? null;
        $teacher->department = $input['department'] ?? null;
        $teacher->title      = $input['title'] ?? null;
        $teacher->specialization = $input['specialization'] ?? null;
        $teacher->hire_date  = $input['hire_date'] ?? null;
        $teacher->status     = $input['status'] ?? 'Active';

        if ($teacher->create()) {
            http_response_code(201);
            echo json_encode(['success' => true, 'message' => 'Enseignant ajouté.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de l'ajout de l'enseignant."]);
        }
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        $teacher->id = intval($_GET['id']);
        if (!$teacher->read_single()) {
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
            foreach (['first_name', 'last_name', 'email', 'phone', 'birth_date', 'address', 'department', 'title', 'specialization', 'hire_date', 'status'] as $k) {
                if (isset($input[$k])) $teacher->$k = $input[$k];
            }
        }
        if ($teacher->update()) {
            echo json_encode(['success' => true, 'message' => 'Enseignant mis à jour.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la modification."]);
        }
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $teacher->id = intval($_GET['id']);
        if (!$teacher->read_single()) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => "Enseignant non trouvé."]);
            exit();
        }
        if ($teacher->delete()) {
            echo json_encode(['success' => true, 'message' => 'Enseignant supprimé.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la suppression."]);
        }
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    error_log("Database error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>


