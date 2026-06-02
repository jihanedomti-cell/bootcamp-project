# Projet Bootcamp

## Objectif
Mini-application web créée dans le cadre d'un bootcamp. Une seule page qui
s'affiche publiquement et qui peut lire/écrire des données dans une base Supabase.

## Stack imposée (à respecter)
- **Front-end** : un seul fichier `index.html` en HTML / CSS / JavaScript *vanilla*.
  Aucun framework (pas de React, Vue, etc.), aucun outil de build, aucun `npm`.
- **Base de données** : Supabase, accédé directement depuis le navigateur via le
  client JavaScript chargé par **CDN** (`@supabase/supabase-js`).
- **Hébergement** : GitHub Pages, servi depuis la branche principale (`main`).

## Règles importantes
- Tout le code tient dans `index.html`.
- **Aucun secret dans le dépôt** : jamais de mot de passe ni de token GitHub.
  La clé Supabase `anon` est *publique par conception* et peut figurer dans
  `index.html` (la sécurité repose sur les règles RLS côté Supabase).
- Le dépôt GitHub est **public** (nécessaire pour GitHub Pages en offre gratuite).

## Structure
```
bootcamp-project/
├── index.html     # toute l'application (HTML + CSS + JS)
├── .gitignore     # ignore secrets et fichiers système
└── CLAUDE.md      # ce fichier (contexte projet)
```

## Base de données — table `events`
Table de test pour vérifier l'écriture :
| colonne     | type        | description                       |
|-------------|-------------|-----------------------------------|
| id          | bigint      | identifiant auto-incrémenté (PK)  |
| type        | text        | type d'événement                  |
| created_at  | timestamptz | date de création (défaut: now())  |

## Déploiement
À chaque modification : `git add . && git commit -m "..." && git push`.
GitHub Pages se met à jour automatiquement après le push (1 à 2 minutes).
