# Kampusya — Plateforme scolaire (Supabase + Netlify)

Ce dossier contient une première version de Kampusya connectée à une vraie base de données (Supabase) et prête à déployer sur Netlify.

## Architecture (V1)

- **Supabase** : authentification (comptes réels avec mot de passe) + base de données. Les données pédagogiques de chaque école (classes, élèves, notes, appel, cahier de texte...) sont stockées en un seul bloc JSON par école (table `school_data`), pour pouvoir démarrer vite sur la base du prototype déjà validé. Les tables `schools`, `payments` et `profiles` (comptes + rôles) sont, elles, de vraies tables relationnelles.
- **Netlify** : hébergement du site (dossier `public/`) + une fonction serveur (`netlify/functions/create-account.js`) qui crée les comptes de connexion de façon sécurisée.

## Étape 1 — Créer le projet Supabase

1. Aller sur [supabase.com](https://supabase.com), créer un compte et un nouveau projet.
2. Dans **SQL Editor**, coller et exécuter le contenu de `schema.sql`.
3. Dans **Project Settings → API**, noter :
   - `Project URL`
   - `anon public key`
   - `service_role key` (⚠️ secrète, ne jamais la mettre dans le code du site)
4. Dans **Authentication → Providers**, vérifier que "Email" est activé (c'est le cas par défaut).

## Étape 2 — Renseigner les clés dans le site

Ouvrir `public/index.html`, tout en haut du `<script>`, et remplacer :

```js
const SUPABASE_URL = "https://VOTRE-PROJET.supabase.co";
const SUPABASE_ANON_KEY = "VOTRE_CLE_ANON_PUBLIQUE";
```

par les vraies valeurs de l'étape 1 (`Project URL` et `anon public key` — la clé anon est publique, sans risque de l'exposer, elle est protégée par les règles RLS).

## Étape 3 — Créer le premier compte Super Admin

Dans Supabase, aller dans **Authentication → Users → Add user**, créer un utilisateur avec votre e-mail et un mot de passe. Copier son `User UID`, puis dans **Table Editor → profiles**, ajouter une ligne :

- `id` = le UID copié
- `school_id` = vide (null)
- `role` = `super_admin`
- `full_name` = votre nom

C'est avec ce compte que vous vous connecterez pour créer les écoles et leurs premiers administrateurs.

## Étape 4 — Déployer sur Netlify

1. Pousser ce dossier sur un dépôt GitHub.
2. Sur [netlify.com](https://netlify.com), "Add new site" → "Import an existing project" → connecter le dépôt.
3. Netlify détecte automatiquement `netlify.toml` (dossier `public` publié, fonctions dans `netlify/functions`).
4. Dans **Site settings → Environment variables**, ajouter :
   - `SUPABASE_URL` = même valeur qu'à l'étape 2
   - `SUPABASE_SERVICE_ROLE_KEY` = la clé secrète notée à l'étape 1 (jamais dans le code, uniquement ici)
5. Déployer. Netlify fournit une adresse en `.netlify.app` ; le nom de domaine définitif (ex. kampusya.com) se branche ensuite dans **Domain settings**.

## Étape 5 — Premiers pas

1. Se connecter avec le compte Super Admin.
2. Créer une école (onglet "Écoles partenaires").
3. Cliquer sur "Compte admin" pour cette école, renseigner le nom et l'e-mail du directeur/directrice — un mot de passe temporaire s'affiche à l'écran : à transmettre manuellement (WhatsApp, SMS...).
4. Se déconnecter, se reconnecter avec ce compte admin : créer les classes, matières, puis les comptes professeurs / élèves / parents (même principe : un mot de passe temporaire s'affiche à chaque création, à transmettre à la personne).

## Limite connue de cette V1 (et pourquoi c'est acceptable pour démarrer)

Toutes les données pédagogiques d'une école sont dans un seul bloc JSON (`school_data`), pas dans des tables séparées par élève/classe/note. C'est ce qui permet de brancher le prototype presque tel quel. Deux conséquences à connaître :

- **Sécurité** : tout compte authentifié d'une école (admin, prof, élève ou parent) peut techniquement écrire n'importe où dans le bloc JSON de son école, pas seulement dans "sa" partie. Pour une école pilote de confiance, c'est un risque raisonnable ; à corriger avant une ouverture à grande échelle.
- **Performance** : au-delà de quelques centaines d'élèves avec beaucoup d'historique (notes, appel jour par jour sur plusieurs années), le bloc JSON grossira et les temps de chargement se dégraderont progressivement.

La suite logique, une fois la formule validée avec une ou deux écoles pilotes, est de migrer vers le schéma entièrement relationnel déjà documenté dans le guide de déploiement (tables séparées : `classes`, `students`, `grades`, `attendance_entries`, etc.), qui lève ces deux limites.
