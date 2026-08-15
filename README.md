# Gestion universitaire

Application React/Vite avec API PHP, base MariaDB/MySQL et serveur WebSocket Node.js. Elle regroupe la gestion des utilisateurs, étudiants, enseignants, cours, salles, planning, évaluations, notes, bulletins, absences, scolarité, paiements, paie du personnel et messagerie en temps réel.

## Prérequis

- Node.js 20 ou plus récent et npm ;
- PHP 8.2 avec `pdo_mysql`, `curl`, `fileinfo` et `mbstring` ;
- MariaDB 10.4+ (environnement actuellement utilisé) ou une version MySQL compatible ;
- Composer seulement si le dossier `backend/vendor` n’est pas fourni ;
- une sauvegarde de la base avant toute mise à jour importante.

## Mise à jour du projet existant sous Windows

1. Arrêtez `npm run dev`.
2. Sauvegardez la base de données et vos éventuels fichiers `.env`.
3. Remplacez le projet par le contenu complet de l’archive corrigée. Ne recopiez pas d’ancien dossier `backend/migrations` par-dessus le nouveau.
4. Conservez votre `.env`, ou créez-le depuis l’exemple :

```powershell
Copy-Item .env.example .env
notepad .env
```

Le `.env` racine est recommandé. Un ancien `backend-ws/.env` reste reconnu en priorité pour assurer la compatibilité. Dans tous les cas, `REALTIME_INTERNAL_SECRET` doit être identique pour PHP et Node, aléatoire, et contenir au moins 32 caractères.

5. Réinstallez exactement les dépendances verrouillées :

```powershell
npm ci
npm --prefix backend-ws ci
```

Si `backend/vendor` est absent :

```powershell
composer install --working-dir=backend --no-dev
```

6. Lancez les migrations :

```powershell
php backend/migrate.php
```

Pour une base qui a déjà reçu une ancienne version de `008_add_payroll_and_report_cards`, le migrateur vérifie d’abord les tables et colonnes réellement présentes. Si le schéma est complet, le résultat attendu contient notamment :

```text
[empreinte réconciliée] 008_add_payroll_and_report_cards (schéma vérifié)
```

Il applique ensuite uniquement les migrations manquantes (`009`, `010`, etc.) et termine par :

```text
Schéma à jour.
```

Relancez immédiatement la commande une seconde fois : toutes les lignes doivent être indiquées comme déjà appliquées et aucune erreur ne doit apparaître.

Important : ne supprimez pas `schema_migrations`, ne renommez pas les migrations et ne modifiez pas manuellement leur empreinte. Si le migrateur signale « schéma incomplet », il affiche maintenant la liste exacte des tables ou colonnes absentes ; conservez la sauvegarde et utilisez ce message pour diagnostiquer la base au lieu de forcer l’empreinte.

## Premier administrateur

Cette commande est uniquement prévue pour une base qui ne possède encore aucun administrateur ni directeur :

```powershell
php backend/create-admin.php --name="Administrateur" --email=admin@example.org --password="un-mot-de-passe-de-12-caracteres"
```

L’inscription publique est désactivée. Les comptes suivants sont créés depuis « Gestion des utilisateurs » par l’administration ou la direction.

## Démarrage

```powershell
npm run dev
```

La commande lance :

- Vite sur `http://localhost:5173` ;
- l’API PHP de développement sur `http://127.0.0.1:8000` ;
- le serveur WebSocket sur le port `3001`.

Le serveur PHP intégré convient au développement local, pas à la production.

Pour ouvrir la même application dans Electron tout en lançant automatiquement Vite, PHP et le WebSocket :

```powershell
npm start
```

## Contrôles avant livraison

```powershell
npm run check
npm audit --omit=dev
npm --prefix backend-ws audit --omit=dev
php backend/migrate.php
```

`npm run check` exécute le lint puis le build de production. Le dossier `dist` est généré par `npm run build`.

## Fonctionnalités et droits

- L’administrateur dispose de tous les modules, peut suspendre ou supprimer logiquement un compte, et ne peut pas supprimer son propre compte connecté.
- Le directeur gère les comptes étudiants et enseignants, mais ne peut ni créer ni modifier un administrateur ou un autre directeur.
- Les droits « Accéder » et « Gérer » sont configurables par module pour chaque étudiant ou enseignant et sont vérifiés dans l’interface comme dans l’API.
- La suppression d’un compte conserve les historiques scolaires, de paie, de messages et d’appels, tout en révoquant ses jetons de connexion.
- L’état « en ligne » dépend d’une connexion WebSocket réelle ; un compte jamais connecté n’est plus affiché en ligne.

## Messagerie, son et appels

Le son de réception est réellement joué par le navigateur lorsque l’option « Sons des messages » est activée. Le navigateur peut toutefois bloquer l’audio avant la première interaction de l’utilisateur.

Les appels audio/vidéo utilisent WebRTC et leur historique est enregistré dans la conversation. Ils nécessitent l’autorisation du micro/de la caméra. STUN suffit souvent sur un même réseau ; pour garantir les appels entre réseaux, VPN ou opérateurs différents, configurez un serveur TURN dans le `.env` :

```dotenv
VITE_TURN_URL=turn:turn.exemple.org:3478
VITE_TURN_USERNAME=utilisateur
VITE_TURN_CREDENTIAL=secret
```

Après modification d’une variable `VITE_*`, redémarrez Vite ou reconstruisez l’application.

## Production

- servez `dist` avec un serveur web adapté ;
- servez `backend` avec PHP-FPM/Apache et HTTPS ;
- exécutez `backend-ws/server.js` comme service supervisé ;
- n’exposez pas `/internal/notify` publiquement ;
- configurez précisément `CORS_ALLOWED_ORIGINS` ;
- placez les secrets dans les variables du système ou dans un `.env` non versionné ;
- configurez un serveur TURN pour les appels hors réseau local.

Consultez également `CORRECTIONS_2026-08-14.md` pour le relevé de l’audit et des corrections.

## Installation depuis un clone Git

Après avoir cloné le dépôt :

```powershell
npm ci
npm --prefix backend-ws ci
composer install --working-dir=backend
Copy-Item .env.example .env
php backend/migrate.php
npm run dev
```

Le fichier `.env` contient la configuration locale et les secrets : il ne doit jamais être committé. Remplacez notamment `REALTIME_INTERNAL_SECRET` par une valeur aléatoire d'au moins 32 caractères.

Pour créer le premier compte administrateur sur une base neuve :

```powershell
php backend/create-admin.php --name="Administrateur" --username=admin --email=admin@example.org --password="UN_MOT_DE_PASSE_FORT"
```

Avant chaque commit important :

```powershell
npm run precommit:check
git status --short
git diff --check
```
