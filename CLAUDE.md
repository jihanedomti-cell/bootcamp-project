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
- `DEMO_MODE` dans `index.html` pilote la couche IA :
  - `false` (par défaut) : **vraie IA Anthropic** via l'Edge Function `ai`
    (modèle `claude-haiku-4-5`). La clé `ANTHROPIC_API_KEY` reste **côté serveur**
    (secret Supabase), jamais dans le code public.
  - `true` : IA **simulée en local** (textes réalistes, aucune clé, aucun coût).
- **Repli automatique** : même en mode réel, chaque appel IA bascule sur la
  simulation locale si l'Edge Function est indisponible (clé absente, réseau,
  quota). L'app reste 100 % cliquable, jamais de crash.
- **Edge Function `ai`** : `supabase/functions/ai/` (Deno, `Deno.serve`). Routeur
  sur `{ action, payload }` couvrant les 6 fonctions IA — `extract`, `generate`,
  `variants`, `calendar`, `coherence`, `tone` — avec sorties structurées (JSON
  Schema). Déploiement + secret : voir le `README.md` de la fonction.
- Côté front, le helper `aiCall(action, payload)` appelle la fonction ; les
  fonctions `callExtract`, `callGenerate`, `callGenerateVariants`, `callCalendar`,
  `callCoherenceScore`, `callToneCheck` l'utilisent puis retombent sur leur
  logique locale en cas d'échec.

## Base de données
Voir `supabase_setup.sql` (à exécuter dans Supabase → SQL Editor).
Tables : `profiles`, `brands`, `generated_contents`, `leads` — toutes protégées
par RLS. Un trigger crée automatiquement le `profile` à chaque inscription.
La colonne `generated_contents.image` (jsonb) mémorise la photo retenue d'un post.

## Photos des posts (banque d'images Pexels)
Les aperçus LinkedIn / Instagram / Facebook intègrent une vraie photo, suggérée
automatiquement puis modifiable (bouton « Changer la photo » → grille + recherche
libre). La photo est mémorisée avec le post (`generated_contents.image`).
- **Proxy serveur** : Edge Function `supabase/functions/search-photos/` (Deno) —
  la clé **`PEXELS_API_KEY` reste côté serveur** (secret Supabase), jamais dans le
  front. Déploiement + secret : voir le `README.md` de la fonction.
- **Sans clé/fonction** : fallback propre (visuels de démonstration sauge), aucun
  crash. Le front n'appelle **jamais** Pexels en direct (clé + CORS).
- En démo, les **mots-clés visuels (EN)** sont dérivés localement ; en mode IA réel,
  l'Edge Function devra renvoyer `{ contenu, visual_keywords:[...] }`.

## Structure du fichier `index.html`
4 vues commutées en JS (pas de rechargement) :
1. **Landing** (visiteur non connecté) — hero, problème, solution, pricing, footer.
2. **Auth** — inscription / connexion via Supabase Auth.
3. **Dashboard** — sidebar de navigation : sélecteur de marque active, puis
   **Brand Memory**, une section **Générer du contenu** avec un item par canal
   (LinkedIn, Instagram, Email, X, Facebook), et une section **Planning** avec
   le **Calendrier éditorial**. Cliquer sur un canal ouvre une vue dédiée avec
   des **pills de formats** (un seul format actif à la fois) ; la génération
   réutilise `generateFormats()` → `callGenerate()` (logique inchangée).
   La section **Analyse** (`#panel-analytics`) montre la **performance réseau réelle**
   (impressions, reach, engagement, clics par réseau) : KPI synthétiques + vue
   comparée (cartes par réseau + courbes multi-séries) et filtre par réseau
   (Tous / Instagram / LinkedIn / Facebook / X / Email — Email a ses propres
   métriques : envois, ouvertures, clics, CTR). La cohérence Brand Memory est
   conservée en second plan (angle différenciant). Données via `analyticsProvider`
   (mock réaliste, déterministe, structuré comme Meta Graph / LinkedIn Marketing) :
   remplacer `mockNetworkMetrics` par les vrais appels sans toucher au reste.
   Charts : **Chart.js 4.4.1** (CDN).
   La section **Trends** (`#panel-trends`, entrée sidebar `nav-trends` 📈) est l'écran
   principal de veille : grille de tendances (sujet / format / hashtag) avec momentum
   (montant / chaud / stable + %), réseaux concernés et **score de pertinence** lié au
   secteur de la marque active ; filtres par catégorie et par momentum. Action clé :
   **« Générer un post sur cette tendance »** → `generateFromTrend()` route vers le
   générateur (`navChannel`) en pré-remplissant `#gen-sujet` (titre + angle suggéré) et
   `state.genContext`. Les **Templates** existants restent accessibles en **sous-onglet
   secondaire** de cette page (`setTrendsTab`). Données via `trendsProvider` (mock
   déterministe par marque, packs sectoriels) : remplacer `mockTrends` par une vraie
   source (écoute sociale / Google Trends) sans toucher au reste.
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
