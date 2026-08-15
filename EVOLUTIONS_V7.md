# Évolutions V7 — gouvernance académique et accès pédagogiques

## Fonctionnalités

1. **Sujets d'évaluation protégés**
   - dépôt du sujet par l'enseignant responsable ;
   - validation/refus par l'administration ou la direction ;
   - téléchargement étudiant uniquement le jour exact de l'évaluation et après validation.

2. **Topbar enrichie**
   - recherche globale des rubriques et principales données accessibles au compte ;
   - date affichée au-dessus de l'heure.

3. **Corbeille des comptes**
   - première suppression réversible ;
   - restauration depuis la Corbeille ;
   - purge définitive avec anonymisation des données d'identité tout en conservant les identifiants techniques requis par les historiques.

4. **Colonnes Actions réservées**
   - les colonnes `Action` / `Actions` des tableaux métier ne sont jamais affichées à un enseignant ou un étudiant ;
   - les workflows pédagogiques explicitement autorisés au rôle restent disponibles hors de ces colonnes.

5. **Politique académique configurable**
   - seuil de moyenne déclenchant un avertissement ;
   - nombre d'avertissements avant décision automatique ;
   - moyenne minimale autorisant le redoublement ;
   - nombre maximal de redoublements ;
   - messages et notifications académiques ;
   - suspension automatique et réactivation réservée à l'administration/direction.

6. **Documents de cours sous contrôle**
   - dépôt de leçons/exercices par l'enseignant ;
   - validation par la direction ;
   - accès étudiant seulement si droits d'inscription + écolage sont intégralement régularisés (`Paid`) ou exemptés (`Exempt`) ;
   - dérogation individuelle possible par l'administration/direction.

## Migration

La migration `011_add_governance_academic_access.sql` ajoute les tables/colonnes nécessaires sans modifier les migrations 001 à 010 déjà appliquées.

## Validation après application

```powershell
npm run check
C:\xampp\php\php.exe .\backend\migrate.php
C:\xampp\php\php.exe .\backend\migrate.php
npm run dev
```

La première migration doit appliquer `011_add_governance_academic_access`; la seconde doit signaler le schéma à jour.
