<?php
/**
 * room_bookings.php
 *
 * Réservations ponctuelles de salles (Task #4 - "resources", partie
 * matérielle). Distinct de planning.php (créneaux récurrents hebdomadaires).
 *
 * GET    ?room_id=X&date=YYYY-MM-DD  -> réservations d'une salle à une date
 * GET    (sans filtre)                -> toutes les réservations à venir
 * POST                                 -> créer une réservation (admin, directeur, teacher)
 * DELETE ?id=X                        -> annuler une réservation (auteur ou admin/directeur)
 */
require_once '../config/database.php';

require_once '../config/cors.php';
applyCorsOrigin();
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-CSRF-Token");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once '../config/auth_guard.php';
require_once '../config/csrf_guard.php';

// Consultation ouverte à tout utilisateur connecté (utile pour vérifier la
// disponibilité d'une salle) ; seule la création/annulation est restreinte.
$allowedRoles = ['admin', 'directeur', 'teacher'];

$database = new Database();
$db = $database->getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents("php://input"), true);

try {
    if ($method === 'GET') {
        listBookings($db);
    } elseif ($method === 'POST') {
        if (!in_array($_SESSION['user_role'], $allowedRoles, true)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Accès refusé - rôle non autorisé']);
            exit();
        }
        createBooking($db, $input);
    } elseif ($method === 'DELETE' && isset($_GET['id'])) {
        if (!in_array($_SESSION['user_role'], $allowedRoles, true)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Accès refusé - rôle non autorisé']);
            exit();
        }
        cancelBooking($db, intval($_GET['id']));
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Méthode non autorisée.']);
    }
} catch (PDOException $e) {
    error_log("PDOException in room_bookings.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Une erreur serveur est survenue.']);
}

function listBookings($db) {
    $conditions = ["rb.status = 'confirmed'"];
    $params = [];

    if (!empty($_GET['room_id'])) {
        $conditions[] = 'rb.room_id = :room_id';
        $params[':room_id'] = intval($_GET['room_id']);
    }
    if (!empty($_GET['date'])) {
        $conditions[] = 'rb.booking_date = :date';
        $params[':date'] = $_GET['date'];
    } else {
        // Par défaut : uniquement les réservations à venir (pas l'historique).
        $conditions[] = 'rb.booking_date >= CURDATE()';
    }

    $where = implode(' AND ', $conditions);
    $stmt = $db->prepare("
        SELECT rb.id, rb.room_id, r.name AS room_name, rb.title,
               rb.booking_date, rb.start_time, rb.end_time,
               u.name AS booked_by_name
        FROM room_bookings rb
        JOIN rooms r ON r.id = rb.room_id
        JOIN users u ON u.id = rb.booked_by
        WHERE $where
        ORDER BY rb.booking_date, rb.start_time
    ");
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    $stmt->execute();
    echo json_encode(['success' => true, 'data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
}

function createBooking($db, $input) {
    if (!$input || !isset($input['room_id'], $input['title'], $input['booking_date'], $input['start_time'], $input['end_time'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Champs obligatoires manquants.']);
        return;
    }

    $roomId = intval($input['room_id']);
    $title = trim((string)$input['title']);
    $date = trim((string)$input['booking_date']);
    $startTime = trim((string)$input['start_time']);
    $endTime = trim((string)$input['end_time']);

    $dateValue = DateTimeImmutable::createFromFormat('!Y-m-d', $date);
    $validDate = $dateValue && $dateValue->format('Y-m-d') === $date;
    $validStart = preg_match('/^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$/', $startTime) === 1;
    $validEnd = preg_match('/^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$/', $endTime) === 1;

    if ($roomId <= 0 || $title === '' || !$validDate || !$validStart || !$validEnd) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Données de réservation invalides.']);
        return;
    }

    if ($startTime >= $endTime) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => "L'heure de fin doit être après l'heure de début."]);
        return;
    }

    $roomStmt = $db->prepare("SELECT id, is_available FROM rooms WHERE id = :id LIMIT 1");
    $roomStmt->bindParam(':id', $roomId, PDO::PARAM_INT);
    $roomStmt->execute();
    $room = $roomStmt->fetch(PDO::FETCH_ASSOC);

    if (!$room) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Salle introuvable.']);
        return;
    }

    if (!(bool)$room['is_available']) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => "Cette salle n'est pas disponible à la réservation."]);
        return;
    }

    // Vérifie les conflits avec les réservations ponctuelles existantes.
    $conflictStmt = $db->prepare("
        SELECT 1 FROM room_bookings
        WHERE room_id = :room_id
        AND booking_date = :date
        AND status = 'confirmed'
        AND start_time < :end_time
        AND end_time > :start_time
        LIMIT 1
    ");
    $conflictStmt->bindParam(':room_id', $roomId, PDO::PARAM_INT);
    $conflictStmt->bindParam(':date', $date);
    $conflictStmt->bindParam(':end_time', $endTime);
    $conflictStmt->bindParam(':start_time', $startTime);
    $conflictStmt->execute();

    if ($conflictStmt->fetchColumn() !== false) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Cette salle est déjà réservée sur ce créneau.']);
        return;
    }

    // Vérifie aussi les conflits avec le planning récurrent (jour de semaine
    // correspondant à la date choisie).
    // ISO-8601 : 1 = lundi ... 7 = dimanche, comme planning_schedules.day_of_week.
    $dayOfWeek = (int)$dateValue->format('N');
    $planningConflictStmt = $db->prepare("
        SELECT 1 FROM planning_schedules
        WHERE room_id = :room_id
        AND day_of_week = :day_of_week
        AND start_time < :end_time
        AND end_time > :start_time
        LIMIT 1
    ");
    $planningConflictStmt->bindParam(':room_id', $roomId, PDO::PARAM_INT);
    $planningConflictStmt->bindParam(':day_of_week', $dayOfWeek, PDO::PARAM_INT);
    $planningConflictStmt->bindParam(':end_time', $endTime);
    $planningConflictStmt->bindParam(':start_time', $startTime);
    $planningConflictStmt->execute();

    if ($planningConflictStmt->fetchColumn() !== false) {
        http_response_code(409);
        echo json_encode(['success' => false, 'message' => 'Cette salle est occupée par un cours du planning sur ce créneau.']);
        return;
    }

    $stmt = $db->prepare("
        INSERT INTO room_bookings (room_id, booked_by, title, booking_date, start_time, end_time)
        VALUES (:room_id, :booked_by, :title, :booking_date, :start_time, :end_time)
    ");
    $stmt->bindParam(':room_id', $roomId, PDO::PARAM_INT);
    $stmt->bindParam(':booked_by', $_SESSION['user_id']);
    $stmt->bindParam(':title', $title);
    $stmt->bindParam(':booking_date', $date);
    $stmt->bindParam(':start_time', $startTime);
    $stmt->bindParam(':end_time', $endTime);
    $stmt->execute();

    http_response_code(201);
    echo json_encode(['success' => true, 'message' => 'Salle réservée.', 'id' => $db->lastInsertId()]);
}

function cancelBooking($db, $bookingId) {
    $stmt = $db->prepare("SELECT booked_by FROM room_bookings WHERE id = :id");
    $stmt->bindParam(':id', $bookingId, PDO::PARAM_INT);
    $stmt->execute();
    $booking = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$booking) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Réservation introuvable.']);
        return;
    }

    $isOwner = (int)$booking['booked_by'] === (int)$_SESSION['user_id'];
    $isStaff = in_array($_SESSION['user_role'], ['admin', 'directeur'], true);

    if (!$isOwner && !$isStaff) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => "Vous ne pouvez annuler que vos propres réservations."]);
        return;
    }

    $update = $db->prepare("UPDATE room_bookings SET status = 'cancelled' WHERE id = :id");
    $update->bindParam(':id', $bookingId, PDO::PARAM_INT);
    $update->execute();

    echo json_encode(['success' => true, 'message' => 'Réservation annulée.']);
}
?>
