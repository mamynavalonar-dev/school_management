<?php
header('Content-Type: application/json; charset=utf-8');
header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Accept");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

function send_json($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

try {
    $action = isset($_GET['action']) ? $_GET['action'] : null;
    if (!$action) {
        send_json(400, ['success'=>false, 'message'=>'Paramètre "action" manquant.']);
    }

    switch ($action) {
        case 'stats':
            // Exemple statiques, à adapter
            $data = [
                'students' => [ 'total'=>156, 'new'=>12, 'active'=>148 ],
                'teachers' => [ 'total'=>24, 'active'=>22 ],
                'courses'  => [ 'total'=>45, 'active'=>42 ],
                'rooms'    => [ 'total'=>18, 'available'=>15 ],
                'grades'   => [ 'pending'=>45, 'completed'=>287 ]
            ];
            send_json(200, ['success'=>true, 'data'=>$data]);
            break;
        case 'activities':
            $data = [
                [ 'id'=>1, 'type'=>'grade', 'description'=>'Nouvelle note ajoutée', 'user'=>'Prof. Durand', 'time'=>date('c') ],
                [ 'id'=>2, 'type'=>'absence', 'description'=>'Absence justifiée', 'user'=>'Admin', 'time'=>date('c') ]
            ];
            send_json(200, ['success'=>true, 'data'=>$data]);
            break;
        case 'upcoming':
            $data = [
                [ 'id'=>1, 'title'=>'Examen Final - Mathématiques', 'date'=>'2025-10-20', 'time'=>'09:00', 'type'=>'exam' ],
                [ 'id'=>2, 'title'=>'Réunion des enseignants', 'date'=>'2025-10-18', 'time'=>'14:00', 'type'=>'meeting' ]
            ];
            send_json(200, ['success'=>true, 'data'=>$data]);
            break;
        default:
            send_json(404, ['success'=>false, 'message'=>'Action inconnue']);
            break;
    }
} catch (Throwable $e) {
    send_json(500, ['success'=>false, 'message'=>'Erreur interne serveur : ' . $e->getMessage()]);
}
?>
