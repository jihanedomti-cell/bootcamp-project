// =============================================================================
// Edge Function Supabase : proxy Pexels (banque d'images)
// La clé PEXELS_API_KEY reste CÔTÉ SERVEUR (secret Supabase) — jamais exposée au
// navigateur. Le front appelle cette fonction, jamais Pexels en direct (CORS + clé).
//
// Déploiement :
//   supabase functions deploy search-photos
//   supabase secrets set PEXELS_API_KEY=xxxxxxxxxxxxxxxx
//
// Réponse normalisée : { ok, query, photos:[{ id, url_small, url_large,
//   photographer, photographer_url, alt }] }
// En cas de souci (clé absente, rate limit, réseau) : HTTP 200 + { ok:false,
//   reason, photos:[] } pour que le front bascule proprement sur son fallback.
// =============================================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const PEXELS_API = "https://api.pexels.com/v1/search";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const key = Deno.env.get("PEXELS_API_KEY");
  if (!key) {
    // Pas de crash : le front affichera des visuels de démonstration.
    return json({ ok: false, reason: "missing_key", photos: [] });
  }

  // Lecture de la requête (GET ?query=... ou POST { query })
  let query = "";
  let perPage = 12;
  try {
    if (req.method === "GET") {
      const u = new URL(req.url);
      query = (u.searchParams.get("query") || "").trim();
      perPage = clampPerPage(u.searchParams.get("per_page"));
    } else {
      const b = await req.json().catch(() => ({}));
      query = String((b as { query?: unknown }).query ?? "").trim();
      perPage = clampPerPage((b as { per_page?: unknown }).per_page);
    }
  } catch (_) { /* ignore — query restera vide */ }

  if (!query) return json({ ok: false, reason: "empty_query", photos: [] });

  try {
    const url = `${PEXELS_API}?query=${encodeURIComponent(query)}` +
      `&per_page=${perPage}&orientation=landscape`;
    const r = await fetch(url, { headers: { Authorization: key } });

    if (r.status === 429) return json({ ok: false, reason: "rate_limited", photos: [] });
    if (!r.ok) return json({ ok: false, reason: "pexels_error", status: r.status, photos: [] });

    const data = await r.json();
    const photos = (data.photos || []).map((p: PexelsPhoto) => ({
      id: p.id,
      url_small: p.src?.medium || p.src?.small || p.src?.tiny || "",
      url_large: p.src?.large || p.src?.large2x || p.src?.original || "",
      photographer: p.photographer || "",
      photographer_url: p.photographer_url || "",
      alt: p.alt || query,
    }));
    return json({ ok: true, query, photos });
  } catch (_) {
    return json({ ok: false, reason: "network_error", photos: [] });
  }
});

function clampPerPage(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 12;
  return Math.min(30, Math.max(1, Math.floor(n)));
}

interface PexelsPhoto {
  id: number;
  photographer?: string;
  photographer_url?: string;
  alt?: string;
  src?: {
    original?: string; large2x?: string; large?: string;
    medium?: string; small?: string; tiny?: string;
  };
}
