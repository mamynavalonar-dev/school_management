<?php
/**
 * specializations.php
 *
 * Référentiel des spécialisations (Informatique, Mathématiques...).
 * Même logique que levels.php.
 *
 * GET    -> liste toutes les spécialisations (tout utilisateur connecté)
 * POST   -> crée une spécialisation (admin/directeur uniquement)
 * PUT    ?id=X -> modifie (admin/directeur uniquement)
 * DELETE ?id=X -> supprime (admin/directeur uniquement)
 */
require_once '../config/database.php';
require_once '../models/Specialization.php';

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

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET' && !in_array($_SESSION['user_role'], ['admin', 'directeur'], true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès refusé - rôle non autorisé']);
    exit();
}

$database = new Database();
$db = $database->getConnection();
$specialization = new Specialization($db);
$input = json_decode(file_get_contents("php://input"), true);

try {
    if ($method === 'GET') {
        $stmt = $specialization->readAll();
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } elseif ($method === 'POST') {
        if (empty($input['name'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Nom de la spécialisation requis.']);
            exit();
        }
        $specialization->name = $input['name'];
        $specialization->capacity = intval($input['capacity'] ?? 30);
        if ($specialization->create()) {
            http_response_code(201);
            echo json_encode(['success' => true, 'message' => 'Spécialisation créée.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Erreur lors de la création.']);
        }
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        $specialization->id = intval($_GET['id']);
        $specialization->name = $input['name'] ?? '';
        $specialization->capacity = intval($input['capacity'] ?? 30);
        if ($specialization->update()) {
            echo json_encode(['success' => true, 'message' => 'Spécialisation mise à jour.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Erreur lors de la modification.']);
        }
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $specialization->id = intval($_GET['id']);
        if ($specialization->delete()) {
            echo json_encode(['success' => true, 'message' => 'Spécialisation supprimée.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Erreur lors de la suppression.']);
        }
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    error_log("PDOException in specializations.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>
