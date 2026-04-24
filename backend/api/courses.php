<?php
require_once '../config/database.php';
require_once '../models/Course.php';

header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$database = new Database();
$db = $database->getConnection();
$course = new Course($db);

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);

try {
    if ($method === 'GET') {
        // Liste tous les cours
        $stmt = $course->read();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $rows]);
    } elseif ($method === 'POST') {
        $required = ['code','name','level_id','specialization_id'];
        foreach ($required as $k) {
            if (empty($input[$k])) {
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => "Champ $k manquant."]);
                exit();
            }
        }
        // Validation complémentaire (type, crédits, etc)
        $course->code = $input['code'];
        $course->name = $input['name'];
        $course->description = $input['description'] ?? '';
        $course->credits = intval($input['credits'] ?? 3);
        $course->hours_per_week = intval($input['hours_per_week'] ?? 2);
        $course->course_type = $input['course_type'] ?? 'Theory';
        $course->level_id = intval($input['level_id']);
        $course->specialization_id = intval($input['specialization_id']);
        $course->is_mandatory = (isset($input['is_mandatory']) ? boolval($input['is_mandatory']) : true);
        
        if ($course->create()) {
            http_response_code(201);
            echo json_encode(['success' => true, 'message' => 'Cours créé.', 'id' => $course->id]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la création du cours."]);
        }
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        $course->id = intval($_GET['id']);
        // Lecture et validation des données existantes
        // (Implémenter méthode read_single si besoin)
        $updateData = $input ?? [];
        foreach (['code','name','description','credits','hours_per_week','course_type','level_id','specialization_id','is_mandatory'] as $k) {
            if (isset($updateData[$k])) $course->$k = $updateData[$k];
        }
        if ($course->update()) {
            echo json_encode(['success' => true, 'message' => 'Cours mis à jour.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la modification du cours."]);
        }
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $course->id = intval($_GET['id']);
        // (Lire/exister d'abord si besoin)
        if ($course->delete()) {
            echo json_encode(['success' => true, 'message' => 'Cours supprimé.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la suppression du cours."]);
        }
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => "Erreur serveur : " . $e->getMessage()]);
}
?>
