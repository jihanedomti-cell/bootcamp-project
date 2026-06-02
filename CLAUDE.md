# Brief to Brand

SaaS de **mémoire de marque** pour agences marketing et solopreneurs français.
L'app mémorise la voix de chaque marque (ton, mots-clés, cible, valeurs) et
génère du contenu cohérent (LinkedIn, Instagram, email, X, Facebook) en quelques
secondes, plus un calendrier éditorial.

## Stack imposée (à respecter)
- **Front-end** : un seul fichier `index.html` en HTML / CSS / JavaScript *vanilla*.
  Aucun framework, aucun build, aucun `npm`. Design sombre inspiré de Linear.app.
- **Base de données + Auth** : Supabase (client JS chargé par CDN).
- **Hébergement** : GitHub Pages, branche `main`.
- **Langue** : 100 % français.

## Règles de sécurité
- **Aucun secret dans le dépôt** (jamais de mot de passe ni de token GitHub ni de
  clé API Anthropic).
- La clé Supabase `sb_publishable_...` est **publique par conception** → elle peut
  figurer dans `index.html`. La sécurité réelle repose sur les règles **RLS**.

## Mode IA
- `DEMO_MODE = true` dans `index.html` : l'IA est **simulée en local** (textes
  réalistes, aucune clé, aucun coût). L'app est 100 % cliquable et démontrable.
- **Pour brancher la vraie IA Anthropic** (plus tard, sans exposer de secret) :
  1. Créer une **Edge Function Supabase** qui détient `ANTHROPIC_API_KEY` (secret
     stocké côté serveur Supabase, jamais dans le code public).
  2. Dans `index.html`, passer `DEMO_MODE = false` et remplacer le corps des
     fonctions `callExtract`, `callGenerate`, `callCalendar` par un `fetch()` vers
     cette Edge Function (qui relaie les prompts définis dans le cahier des charges).

## Base de données
Voir `supabase_setup.sql` (à exécuter dans Supabase → SQL Editor).
Tables : `profiles`, `brands`, `generated_contents`, `leads` — toutes protégées
par RLS. Un trigger crée automatiquement le `profile` à chaque inscription.

## Structure du fichier `index.html`
4 vues commutées en JS (pas de rechargement) :
1. **Landing** (visiteur non connecté) — hero, problème, solution, pricing, footer.
2. **Auth** — inscription / connexion via Supabase Auth.
3. **Dashboard** — sidebar des marques + 3 onglets : Brand Memory, Générer du
   contenu, Calendrier éditorial.
4. **Éditeur de marque** — assistant en 3 étapes :
   - Étape 1 : infos de base (nom, secteur, site, couleur).
   - Étape 2 : **upload de documents** par drag & drop (.pdf, .doc, .docx, .txt,
     max 5 fichiers / 10 Mo). Extraction du texte en local : **pdf.js** (PDF),
     **mammoth.js** (Word .docx), FileReader (TXT). Les fichiers sont aussi envoyés
     dans le bucket Supabase Storage `brand-documents/{user_id}/{brand_id}/`
     (upload best-effort : ignoré silencieusement si le bucket n'est pas configuré).
     Le texte concaténé est envoyé à `callExtract()` (IA, simulée en mode démo).
   - Étape 3 : validation / édition de la Brand Memory, puis création.

## Déploiement
`git add . && git commit -m "..." && git push` → GitHub Pages se met à jour
automatiquement (1 à 2 min).
URL publique : https://jihanedomti-cell.github.io/bootcamp-project/
