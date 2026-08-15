#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
let failures = 0;
let warnings = 0;

const ok = (msg) => console.log('OK   ' + msg);
const warn = (msg) => { warnings += 1; console.warn('WARN ' + msg); };
const bad = (msg) => { failures += 1; console.error('FAIL ' + msg); };

const run = (command, args, options = {}) => spawnSync(command, args, {
  cwd: ROOT,
  encoding: 'utf8',
  shell: false,
  ...options,
});

const required = [
  'package.json',
  'package-lock.json',
  'backend-ws/package.json',
  'backend-ws/package-lock.json',
  'backend/composer.json',
  'backend/migrations/012_add_usernames.sql',
  '.gitignore',
  '.env.example',
];

for (const relative of required) {
  fs.existsSync(path.join(ROOT, relative)) ? ok(relative + ' présent') : bad(relative + ' manquant');
}

// Le lock Composer est recommandé pour rendre les clones reproductibles.
if (fs.existsSync(path.join(ROOT, 'backend', 'composer.lock'))) {
  ok('backend/composer.lock présent');
} else {
  warn('backend/composer.lock absent. Avant le commit, exécute "composer install --working-dir=backend" puis committe le composer.lock généré.');
}

// Aucun artefact de correction/snapshot ne doit rester à la racine.
const rootNames = fs.readdirSync(ROOT);
const unwanted = rootNames.filter((name) =>
  name === 'correctif_backups' ||
  /^copie_\d+\.txt$/i.test(name) ||
  /^correctif_.*\.(?:mjs|patch)$/i.test(name) ||
  /^appliquer_correctif_.*\.mjs$/i.test(name) ||
  /^appliquer_evolutions_v.*\.mjs$/i.test(name)
);
unwanted.length ? bad('artefacts locaux encore présents : ' + unwanted.join(', ')) : ok('aucun artefact de correction/snapshot à publier');

// Scanner de secrets ciblé sur les fichiers réellement destinés au dépôt.
const scanRoots = [
  'src',
  'backend',
  'backend-ws',
  'public',
];
const excludedDirs = new Set(['vendor', 'node_modules', 'uploads', 'storage', 'dist', '.git', 'correctif_backups']);
const textExt = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.php', '.json', '.md', '.css', '.html', '.sql', '.yml', '.yaml', '.env', '.example']);

const candidates = [];
function walk(relative) {
  const abs = path.join(ROOT, relative);
  if (!fs.existsSync(abs)) return;
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    if (excludedDirs.has(path.basename(abs))) return;
    for (const child of fs.readdirSync(abs)) walk(path.join(relative, child));
    return;
  }
  if (textExt.has(path.extname(abs).toLowerCase()) || path.basename(abs) === '.env.example') candidates.push(abs);
}
for (const root of scanRoots) walk(root);
for (const rootFile of ['README.md', '.env.example', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js', 'eslint.config.js', 'main.js', 'preload.js', 'package.json']) {
  if (fs.existsSync(path.join(ROOT, rootFile))) candidates.push(path.join(ROOT, rootFile));
}

const secretPatterns = [
  ['clé privée', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['token GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['clé OpenAI', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['clé AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['mot de passe de développement admin123', /\badmin123\b/i],
];

for (const file of [...new Set(candidates)]) {
  let content;
  try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
  for (const [label, regex] of secretPatterns) {
    if (regex.test(content)) bad(label + ' détecté dans ' + path.relative(ROOT, file));
  }
}
if (failures === 0) ok('scan ciblé des secrets terminé');

// Vérifie que .env / vendor / dépendances ne sont pas déjà suivis par Git.
const gitRoot = run('git', ['rev-parse', '--show-toplevel']);
if (gitRoot.status === 0) {
  const resolved = path.resolve(gitRoot.stdout.trim());
  if (resolved !== path.resolve(ROOT)) {
    bad('la racine Git n’est pas school_management : ' + resolved);
  } else {
    ok('racine Git correcte');
  }

  const trackedLocal = run('git', ['ls-files', '--', '.env', 'backend-ws/.env', 'backend/vendor', 'node_modules', 'backend-ws/node_modules', 'dist', 'correctif_backups']);
  if ((trackedLocal.stdout || '').trim()) {
    bad('fichiers locaux déjà suivis par Git :\n' + trackedLocal.stdout.trim());
  } else {
    ok('aucun secret/dépendance/build local suivi par Git');
  }

  const diffCheck = run('git', ['diff', '--check']);
  diffCheck.status === 0 ? ok('git diff --check') : bad('git diff --check :\n' + (diffCheck.stdout || diffCheck.stderr));
} else {
  warn('dépôt Git non initialisé ; exécute "git init" dans school_management après les contrôles.');
}

// Taille des fichiers source à publier : alerte à partir de 20 MiB.
const MAX_BYTES = 20 * 1024 * 1024;
const sizeRoots = ['src', 'backend', 'backend-ws', 'public'];
function checkSize(relative) {
  const abs = path.join(ROOT, relative);
  if (!fs.existsSync(abs)) return;
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    if (excludedDirs.has(path.basename(abs))) return;
    for (const child of fs.readdirSync(abs)) checkSize(path.join(relative, child));
  } else if (stat.size > MAX_BYTES) {
    bad('fichier > 20 MiB : ' + relative + ' (' + Math.round(stat.size / 1024 / 1024) + ' MiB)');
  }
}
for (const root of sizeRoots) checkSize(root);

// Syntaxe WebSocket.
const wsCheck = run(process.execPath, ['--check', 'backend-ws/server.js']);
wsCheck.status === 0 ? ok('syntaxe backend-ws/server.js') : bad('syntaxe backend-ws/server.js :\n' + (wsCheck.stderr || wsCheck.stdout));

// Lint PHP de tout le backend applicatif hors vendor.
const phpVersion = run('php', ['-v']);
if (phpVersion.status !== 0) {
  bad('PHP introuvable dans PATH ; impossible de vérifier les fichiers PHP');
} else {
  const phpFiles = [];
  function collectPhp(relative) {
    const abs = path.join(ROOT, relative);
    if (!fs.existsSync(abs)) return;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      if (path.basename(abs) === 'vendor') return;
      for (const child of fs.readdirSync(abs)) collectPhp(path.join(relative, child));
    } else if (abs.endsWith('.php')) {
      phpFiles.push(relative);
    }
  }
  collectPhp('backend');
  let phpFailed = false;
  for (const relative of phpFiles) {
    const result = run('php', ['-l', relative]);
    if (result.status !== 0) {
      phpFailed = true;
      bad('PHP lint ' + relative + ':\n' + (result.stderr || result.stdout));
    }
  }
  if (!phpFailed) ok('PHP lint : ' + phpFiles.length + ' fichiers');
}

// ESLint + build Vite. Le script npm "check" du projet fait les deux.
const npmCheck = process.platform === 'win32'
  ? run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm run check'], { stdio: 'inherit' })
  : run('npm', ['run', 'check'], { stdio: 'inherit' });

if (npmCheck.error) {
  bad('impossible de lancer npm run check : ' + npmCheck.error.message);
} else if (npmCheck.status === 0) {
  ok('npm run check');
} else {
  bad('npm run check a échoué avec le code ' + String(npmCheck.status));
}

console.log('\n────────────────────────────────────────');
console.log('Résultat pré-commit : ' + failures + ' erreur(s), ' + warnings + ' avertissement(s).');
if (warnings > 0) console.log('Lis les avertissements avant de publier.');
if (failures > 0) process.exit(1);

console.log('Projet prêt pour git add / commit.');
