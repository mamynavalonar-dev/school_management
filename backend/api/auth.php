<?php
require_once '../config/database.php';

header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

// Gérer les requêtes OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

session_start();

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);

if ($method === 'POST') {
    // Détecte si login ou register
    if (isset($input['name'])) {
        register($db, $input);
    } else {
        login($db, $input);
    }
} elseif ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'logout') {
    logout();
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Méthode non autorisée']);
}

function register($db, $data) {
    if (empty($data['name']) || empty($data['email']) || empty($data['password'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Tous les champs sont requis.']);
        return;
    }
    if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Email invalide.']);
        return;
    }

    $query = "SELECT id FROM users WHERE email = :email";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':email', $data['email']);
    $stmt->execute();
    if ($stmt->rowCount() > 0) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Cet email est déjà utilisé.']);
        return;
    }

    $query = "INSERT INTO users (name, email, password, role) VALUES (:name, :email, :password, 'admin')";
    $stmt = $db->prepare($query);
    $hashed_password = password_hash($data['password'], PASSWORD_DEFAULT);

    $stmt->bindParam(':name', $data['name']);
    $stmt->bindParam(':email', $data['email']);
    $stmt->bindParam(':password', $hashed_password);

    if ($stmt->execute()) {
        echo json_encode([
            'success' => true,
            'message' => 'Inscription réussie'
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => "Erreur lors de l'inscription"]);
    }
}

function login($db, $data) {
    // Bloque brute-force par IP
    if (!isset($_SESSION['login_attempts'])) $_SESSION['login_attempts'] = 0;
    if ($_SESSION['login_attempts'] >= 10) {
        http_response_code(429); // Too many requests
        echo json_encode(['success' => false, 'message' => 'Trop de tentatives, veuillez patienter.']);
        return;
    }

    if (empty($data['email']) || empty($data['password'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Email et mot de passe requis.']);
        return;
    }
    if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Email invalide.']);
        return;
    }

    $query = "SELECT id, name, email, password, role FROM users WHERE email = :email";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':email', $data['email']);
    $stmt->execute();

    if ($stmt->rowCount() === 0) {
        $_SESSION['login_attempts']++;
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Email ou mot de passe incorrect.']);
        return;
    }

    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!password_verify($data['password'], $user['password'])) {
        $_SESSION['login_attempts']++;
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Email ou mot de passe incorrect.']);
        return;
    }

    // Authentification réussie, on reset les tentatives et définit l'expiration
    $_SESSION['login_attempts'] = 0;
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['user_name'] = $user['name'];
    $_SESSION['user_email'] = $user['email'];
    $_SESSION['user_role'] = $user['role'];
    $_SESSION['LAST_ACTIVITY'] = time();

    // Définit une expiration de 30 min
    ini_set('session.gc_maxlifetime', 1800);

    echo json_encode([
        'success' => true,
        'message' => 'Connexion réussie',
        'data'    => [
            'id' => $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role']
        ]
    ]);
}

function logout() {
    session_unset();
    session_destroy();
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'Déconnexion réussie']);
}
?>
