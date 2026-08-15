<?php
/**
 * Module d'upload sécurisé partagé.
 *
 * Utilisé par : absences.php (justificatifs), messages.php (pièces jointes).
 *
 * Principes de sécurité appliqués :
 *  - Whitelist stricte d'extensions ET de MIME types réels (via finfo, pas
 *    le Content-Type déclaré par le client, qui est falsifiable).
 *  - Taille max par fichier.
 *  - Nom de fichier randomisé sur disque : le nom original de l'utilisateur
 *    n'est JAMAIS utilisé comme nom de fichier (évite path traversal,
 *    collisions, et exécution de scripts si un .php est renommé en .pdf).
 *  - Stockage HORS du webroot (/mnt/uploads, pas /public/uploads) : aucun
 *    fichier n'est accessible par une URL directe. Le téléchargement passe
 *    toujours par un script PHP qui revérifie les droits d'accès avant de
 *    streamer le contenu (voir download.php).
 *  - Le dossier de stockage a un .htaccess "Deny from all" en défense en
 *    profondeur, même s'il est déjà hors webroot.
 */

// Racine de stockage, hors de tout dossier servi par le serveur web.
// À adapter selon le déploiement : doit pointer en dehors de public_html/.
define('UPLOAD_ROOT', __DIR__ . '/../../storage/uploads');

const UPLOAD_MAX_BYTES = 15 * 1024 * 1024; // 15 Mo

const ALLOWED_UPLOAD_TYPES = [
    'application/pdf' => 'pdf',
    'image/jpeg'       => 'jpg',
    'image/png'        => 'png',
    'text/plain'       => 'txt',
    'application/msword' => 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
    'application/vnd.ms-excel' => 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
    'application/vnd.ms-powerpoint' => 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx',
];

/**
 * Valide et déplace un fichier uploadé ($_FILES['xxx']) vers le stockage
 * sécurisé. Retourne un tableau décrivant le fichier stocké, ou lève une
 * UploadException en cas de problème (à catcher dans l'endpoint appelant).
 *
 * @param array  $fileEntry  Une entrée de $_FILES (ex: $_FILES['justification'])
 * @param string $subfolder  Sous-dossier logique (ex: 'absences', 'messages')
 * @return array{original_name:string, stored_name:string, mime_type:string, size_bytes:int, path:string}
 */
function handleSecureUpload(array $fileEntry, string $subfolder): array {
    if (!isset($fileEntry['error']) || is_array($fileEntry['error'])) {
        throw new UploadException('Requête de fichier invalide.');
    }

    switch ($fileEntry['error']) {
        case UPLOAD_ERR_OK:
            break;
        case UPLOAD_ERR_NO_FILE:
            throw new UploadException('Aucun fichier envoyé.');
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            throw new UploadException('Fichier trop volumineux.');
        default:
            throw new UploadException('Erreur lors du transfert du fichier.');
    }

    if ($fileEntry['size'] > UPLOAD_MAX_BYTES) {
        throw new UploadException('Fichier trop volumineux (max 15 Mo).');
    }

    // Détection du vrai type MIME à partir du contenu binaire, PAS du
    // Content-Type déclaré par le navigateur (falsifiable).
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $realMime = $finfo->file($fileEntry['tmp_name']);

    if (!isset(ALLOWED_UPLOAD_TYPES[$realMime])) {
        throw new UploadException('Type de fichier non autorisé. Formats acceptés : PDF, images, TXT et documents Office.');
    }

    $extension = ALLOWED_UPLOAD_TYPES[$realMime];

    // Nom de fichier entièrement randomisé : aucune trace du nom original
    // ou de son extension déclarée dans le nom sur disque.
    $storedName = bin2hex(random_bytes(24)) . '.' . $extension;

    $targetDir = UPLOAD_ROOT . '/' . preg_replace('/[^a-z0-9_\-]/i', '', $subfolder);
    if (!is_dir($targetDir)) {
        if (!mkdir($targetDir, 0750, true) && !is_dir($targetDir)) {
            throw new UploadException('Impossible de créer le dossier de stockage.');
        }
        // Défense en profondeur : bloque l'accès direct même si le dossier
        // se retrouvait un jour sous un webroot mal configuré.
        file_put_contents($targetDir . '/.htaccess', "Deny from all\n");
    }

    $targetPath = $targetDir . '/' . $storedName;

    if (!move_uploaded_file($fileEntry['tmp_name'], $targetPath)) {
        throw new UploadException('Échec de l\'enregistrement du fichier.');
    }

    // Permissions restrictives : lecture/écriture pour le process PHP
    // uniquement, pas d'exécution.
    chmod($targetPath, 0640);

    return [
        'original_name' => basename($fileEntry['name']), // pour affichage seulement, jamais pour le chemin
        'stored_name'   => $storedName,
        'mime_type'     => $realMime,
        'size_bytes'    => $fileEntry['size'],
        'path'          => $targetPath,
    ];
}

/**
 * Résout le chemin disque d'un fichier stocké à partir de son nom
 * randomisé, en s'assurant qu'il ne peut pas sortir de UPLOAD_ROOT
 * (protection path traversal même si stored_name venait à être malformé).
 */
function resolveSecureUploadPath(string $subfolder, string $storedName): ?string {
    $safeSubfolder = preg_replace('/[^a-z0-9_\-]/i', '', $subfolder);
    $safeName = basename($storedName); // supprime tout ../ ou séparateur de chemin

    $path = realpath(UPLOAD_ROOT . '/' . $safeSubfolder . '/' . $safeName);
    $rootReal = realpath(UPLOAD_ROOT);

    if ($path === false || $rootReal === false || strpos($path, $rootReal) !== 0) {
        return null;
    }

    return $path;
}

class UploadException extends Exception {}
