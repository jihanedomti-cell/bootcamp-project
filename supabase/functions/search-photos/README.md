# Edge Function `search-photos` — proxy Pexels

Proxy serveur qui interroge l'API Pexels **sans jamais exposer la clé** au
navigateur. Le front (`index.html`) appelle cette fonction ; il n'appelle
**jamais** Pexels directement (clé + CORS).

## 1. Obtenir une clé Pexels (gratuite)
1. Crée un compte sur https://www.pexels.com/api/
2. Récupère ta clé API (chaîne longue).

## 2. Poser le secret côté Supabase (production)
La clé est un **secret serveur**, jamais dans le dépôt :
```bash
supabase login                      # une fois
supabase link --project-ref <ref>   # ref du projet (dashboard Supabase → Settings)
supabase secrets set PEXELS_API_KEY=ta_cle_pexels
```

## 3. Déployer la fonction
```bash
supabase functions deploy search-photos
```
> Le front envoie le JWT de l'utilisateur connecté → la vérification JWT par
> défaut convient. Si tu veux un proxy 100 % public, déploie avec
> `--no-verify-jwt`.

## 4. Tester en local (optionnel)
```bash
cp .env.example .env        # puis renseigne PEXELS_API_KEY
supabase functions serve search-photos --env-file .env
# puis : curl "http://localhost:54321/functions/v1/search-photos?query=coffee"
```

## Contrat de réponse
```jsonc
// succès
{ "ok": true, "query": "coffee",
  "photos": [
    { "id": 123, "url_small": "…", "url_large": "…",
      "photographer": "Jane Doe", "photographer_url": "https://…", "alt": "…" }
  ]
}
// souci (clé absente, rate limit, réseau) → HTTP 200, le front bascule en fallback
{ "ok": false, "reason": "missing_key" | "rate_limited" | "pexels_error" | "network_error", "photos": [] }
```

## Tant que la fonction n'est pas déployée
Le front détecte l'absence de réponse exploitable et affiche des **visuels de
démonstration** (placeholders sauge) avec un message clair. Aucun crash.
