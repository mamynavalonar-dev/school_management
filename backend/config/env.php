<?php
/**
 * config/env.php
 *
 * Charge le fichier .env pour que getenv() puisse lire les variables
 * qui y sont définies côté PHP — exactement comme server.js le fait côté
 * Node avec require('dotenv').config().
 *
 * PHP et Node doivent lire les mêmes valeurs, notamment le secret interne.
 * Le fichier recommandé est désormais le `.env` à la racine du projet.
 * `backend-ws/.env` reste accepté en priorité pour ne pas casser les
 * installations existantes ; le fichier racine complète les valeurs
 * absentes. Les variables définies par le système gardent la priorité.
 *
 * À inclure une seule fois, tôt, avant tout usage de getenv() dans une
 * requête (require_once, donc sans risque si inclus plusieurs fois).
 */

$autoload = __DIR__ . '/../vendor/autoload.php';
if (!file_exists($autoload)) {
    // Composer n'a pas encore été installé (composer install manquant).
    // On ne fait pas planter l'appli pour autant : les getenv() retomberont
    // simplement sur leurs valeurs par défaut, comme avant ce fichier.
    error_log("config/env.php: vendor/autoload.php introuvable — as-tu lancé 'composer install' dans backend/ ? Les variables du .env ne seront pas chargées.");
    return;
}

require_once $autoload;

$projectRoot = dirname(__DIR__, 2);
$legacyWsDir = $projectRoot . '/backend-ws';

// safeLoad() ne lève pas d'exception si un fichier est absent. L'ordre est
// intentionnel : l'ancien fichier WebSocket, s'il existe, conserve la
// priorité ; le fichier racine complète ensuite les clés non définies.
Dotenv\Dotenv::createUnsafeImmutable($legacyWsDir)->safeLoad();
Dotenv\Dotenv::createUnsafeImmutable($projectRoot)->safeLoad();

if (!file_exists($legacyWsDir . '/.env') && !file_exists($projectRoot . '/.env')) {
    error_log('config/env.php: aucun fichier .env trouvé ; utilisation des variables système.');
}
?>
