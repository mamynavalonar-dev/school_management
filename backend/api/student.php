<?php
require_once '../config/database.php';
require_once '../models/Students.php';

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
$student = new Students($db);

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);

try {
    if ($method === 'GET') {
        // Lister tous les étudiants
        $stmt = $student->readAll();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'data' => $rows]);
    } elseif ($method === 'POST') {
        if (!$input || !isset($input['first_name'], $input['last_name'], $input['email'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Champs obligatoires manquants.']);
            exit();
        }
        if (!filter_var($input['email'], FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Email invalide.']);
            exit();
        }
        // On peut compléter avec + de validation ici (numéro, etc)
        $student->first_name = $input['first_name'];
        $student->last_name  = $input['last_name'];
        $student->email      = $input['email'];
        $student->phone      = $input['phone']      ?? null;
        $student->birth_date = $input['birth_date'] ?? null;
        $student->status     = $input['status']     ?? 'Active';

        if ($student->create()) {
            http_response_code(201);
            echo json_encode(['success' => true, 'message' => 'Étudiant créé avec succès.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la création de l'étudiant."]);
        }
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        $student->id = intval($_GET['id']);
        if (!$student->read_single()) {
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
            foreach (['first_name', 'last_name', 'email', 'phone', 'birth_date', 'status'] as $k) {
                if (isset($input[$k])) $student->$k = $input[$k];
            }
        }
        if ($student->update()) {
            echo json_encode(['success' => true, 'message' => 'Étudiant mis à jour.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la mise à jour de l'étudiant."]);
        }
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $student->id = intval($_GET['id']);
        if (!$student->read_single()) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => "Étudiant non trouvé."]);
            exit();
        }
        if ($student->delete()) {
            echo json_encode(['success' => true, 'message' => 'Étudiant supprimé avec succès.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => "Erreur lors de la suppression de l'étudiant."]);
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
