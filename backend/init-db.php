<?php
// Compatibilité avec l'ancienne commande : l'initialisation passe désormais
// par le moteur de migrations versionnées et n'est jamais exposée sur HTTP.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit();
}

require __DIR__ . '/migrate.php';
?>
