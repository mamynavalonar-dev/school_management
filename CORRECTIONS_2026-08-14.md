# Corrections techniques — 14 août 2026

Ce rapport accompagne le correctif global V6.

## Corrections appliquées

- Fenêtre d'upload/photo : correctif V5 appliqué de façon idempotente (portail React, verrou de défilement, géométrie et focus du sélecteur de fichier).
- Réservations de salles : correction de la convention du jour de semaine. Le planning utilise 1=lundi à 7=dimanche ; PHP `date('w')` renvoyait 0 pour le dimanche. Le contrôle utilise maintenant ISO-8601.
- Réservations de salles : validation du format de date/heure, du titre, de l'identifiant de salle et de la disponibilité de la salle.
- Catalogue des cours : l'interface de création/modification/suppression est désormais limitée aux rôles administrateur et directeur, comme l'API PHP. Les enseignants gardent leurs droits sur les ressources pédagogiques de leurs propres cours.
- AppContext : normalisation de la réponse de `getDashboardStats()` pour stocker `response.data` plutôt que l'enveloppe API complète.
- Configuration : ajout d'un `.env.example` sûr à copier ; le secret temps réel reste volontairement invalide tant qu'il n'est pas remplacé.
- Dépôt : ajout/complément de `.gitignore` pour éviter de versionner secrets, dépendances, builds et fichiers uploadés.

## Contrôles recommandés après application

```powershell
npm run check
npm run build
C:\xampp\php\php.exe backend\migrate.php
npm run dev
```

Pour la messagerie temps réel, remplacez impérativement `REALTIME_INTERNAL_SECRET` dans `.env` par une valeur aléatoire d'au moins 32 caractères avant de lancer le serveur WebSocket.
