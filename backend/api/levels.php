<?php
/**
 * levels.php
 *
 * Référentiel des niveaux (L1, L2, L3, M1, M2...). Nécessaire pour peupler
 * les listes déroulantes de Courses/Planning avec de vrais level_id plutôt
 * qu'une liste statique côté frontend.
 *
 * GET    -> liste tous les niveaux (tout utilisateur connecté)
 * POST   -> crée un niveau (admin/directeur uniquement)
 * PUT    ?id=X -> modifie un niveau (admin/directeur uniquement)
 * DELETE ?id=X -> supprime un niveau (admin/directeur uniquement)
 */
require_once '../config/database.php';
require_once '../models/Level.php';

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

// Lecture ouverte à tout utilisateur connecté ; écriture réservée à
// l'administration pédagogique.
if ($method !== 'GET' && !in_array($_SESSION['user_role'], ['admin', 'directeur'], true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Accès refusé - rôle non autorisé']);
    exit();
}

$database = new Database();
$db = $database->getConnection();
$level = new Level($db);
$input = json_decode(file_get_contents("php://input"), true);

try {
    if ($method === 'GET') {
        $stmt = $level->readAll();
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    } elseif ($method === 'POST') {
        if (empty($input['name'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Nom du niveau requis.']);
            exit();
        }
        $level->name = $input['name'];
        $level->capacity = intval($input['capacity'] ?? 30);
        if ($level->create()) {
            http_response_code(201);
            echo json_encode(['success' => true, 'message' => 'Niveau créé.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Erreur lors de la création.']);
        }
    } elseif ($method === 'PUT' && isset($_GET['id'])) {
        $level->id = intval($_GET['id']);
        $level->name = $input['name'] ?? '';
        $level->capacity = intval($input['capacity'] ?? 30);
        if ($level->update()) {
            echo json_encode(['success' => true, 'message' => 'Niveau mis à jour.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Erreur lors de la modification.']);
        }
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        $level->id = intval($_GET['id']);
        if ($level->delete()) {
            echo json_encode(['success' => true, 'message' => 'Niveau supprimé.']);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Erreur lors de la suppression.']);
        }
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    error_log("PDOException in levels.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}
?>
