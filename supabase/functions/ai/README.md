# Edge Function `ai` — proxy IA Anthropic (Claude)

Proxy serveur qui appelle l'API Anthropic **sans jamais exposer la clé** au
navigateur. Le front (`index.html`) appelle cette fonction ; il n'appelle
**jamais** l'API Anthropic directement (clé + CORS).

Modèle utilisé : **`claude-haiku-4-5`** (rapide et économique). Pour changer,
modifie la constante `MODEL` en haut de `index.ts`.

## 1. Obtenir une clé Anthropic
1. Crée un compte sur https://console.anthropic.com/
2. Onglet **API Keys** → crée une clé (commence par `sk-ant-…`).
3. Ajoute du crédit (onglet **Billing**) — l'API est payante à l'usage.

## 2. Poser le secret côté Supabase (production)
La clé est un **secret serveur**, jamais dans le dépôt :
```bash
supabase login                      # une fois
supabase link --project-ref <ref>   # ref du projet (dashboard Supabase → Settings)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-ta_cle
```

## 3. Déployer la fonction
```bash
supabase functions deploy ai
```
> ⚠️ Le slug déployé doit être **`ai`** (minuscules) pour correspondre à
> `AI_ENDPOINT` dans `index.html` (`/functions/v1/ai`).
>
> Le front envoie le JWT de l'utilisateur connecté → la vérification JWT par
> défaut convient.

### Alternative sans CLI : l'éditeur web Supabase
Dashboard → **Edge Functions** → *New function* → nom `ai` → colle le contenu de
`index.ts` (il utilise `Deno.serve`, compatible éditeur web, sans import externe).
Pose ensuite le secret dans **Edge Functions → Secrets**.

## 4. Tester en local (optionnel)
```bash
cp .env.example .env        # puis renseigne ANTHROPIC_API_KEY
supabase functions serve ai --env-file .env
# puis :
curl -X POST "http://localhost:54321/functions/v1/ai" \
  -H "Content-Type: application/json" \
  -d '{"action":"extract","payload":{"contenu":"Nous aidons les PME à mieux communiquer, avec proximité et transparence."}}'
```

## Contrat d'appel
Requête : `POST { action, payload }`. Actions et `payload` attendu :

| action      | payload                                  | `data` renvoyé |
|-------------|------------------------------------------|----------------|
| `extract`   | `{ contenu }`                            | `{ ton, mots_cles, mots_interdits, cible, valeurs }` |
| `generate`  | `{ brand, sujet, format }`               | `{ contenu }` |
| `variants`  | `{ brand, sujet, format, channel }`      | `{ variantes:[{ titre, accroche, contenu }] }` |
| `calendar`  | `{ brand, periode, reseaux, freq }`      | `{ items:[{ date, reseau, sujet, angle }] }` |
| `coherence` | `{ contenu, brandMemory }`               | `{ score, niveau, points_forts, points_amelioration, resume }` |
| `tone`      | `{ texte, brandMemory }`                 | `{ score, niveau, resume, ce_qui_correspond, ce_qui_ne_correspond_pas, version_corrigee }` |

`brand` = `{ nom, secteur, brand_memory:{ ton, mots_cles, mots_interdits, cible, valeurs } }`.

## Contrat de réponse
```jsonc
// succès
{ "ok": true, "data": { /* selon l'action */ } }
// souci (clé absente, erreur API, réseau) → HTTP 200, le front bascule en fallback
{ "ok": false, "reason": "missing_key" | "ai_error" | "unknown_action" | "bad_request" }
```

## Tant que la fonction n'est pas déployée
Le front (`DEMO_MODE = false`) tente l'appel, échoue proprement, puis **bascule
automatiquement sur la simulation locale** (textes générés en local). Aucun crash :
l'app reste 100 % cliquable même sans clé ni fonction déployée.
