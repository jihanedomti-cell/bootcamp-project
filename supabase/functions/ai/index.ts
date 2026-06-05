// =============================================================================
// Edge Function Supabase : proxy IA (Anthropic / Claude)
// La clé ANTHROPIC_API_KEY reste CÔTÉ SERVEUR (secret Supabase) — jamais exposée
// au navigateur. Le front appelle cette fonction, jamais l'API Anthropic en direct.
//
// Routeur sur { action, payload }. 6 actions :
//   extract   -> { ton, mots_cles, mots_interdits, cible, valeurs }
//   generate  -> { contenu }
//   variants  -> { variantes:[{ titre, accroche, contenu }] }
//   calendar  -> { items:[{ date, reseau, sujet, angle }] }
//   coherence -> { score, niveau, points_forts, points_amelioration, resume }
//   tone      -> { score, niveau, resume, ce_qui_correspond,
//                  ce_qui_ne_correspond_pas, version_corrigee }
//
// Réponse normalisée : { ok:true, data } ou { ok:false, reason }.
// En cas de souci (clé absente, erreur API, réseau) : HTTP 200 + { ok:false }
// pour que le front bascule proprement sur sa simulation locale (jamais de crash).
// =============================================================================

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const SYSTEM_BASE =
  "Tu es l'assistant IA de Brandly, un SaaS français de mémoire de marque. " +
  "Tu écris un français impeccable, naturel, vivant et professionnel — jamais de " +
  "traduction littérale ni d'anglicismes inutiles. Tu respectes scrupuleusement la " +
  "voix de marque fournie (ton, mots-clés, mots à éviter, cible, valeurs). " +
  "Tu réponds UNIQUEMENT avec l'objet JSON demandé, sans texte autour.";

// ---- Schémas de sortie structurée (JSON Schema) --------------------------
const SCHEMAS: Record<string, unknown> = {
  extract: {
    type: "object",
    properties: {
      ton: { type: "string" },
      mots_cles: { type: "array", items: { type: "string" } },
      mots_interdits: { type: "array", items: { type: "string" } },
      cible: { type: "string" },
      valeurs: { type: "array", items: { type: "string" } },
    },
    required: ["ton", "mots_cles", "mots_interdits", "cible", "valeurs"],
    additionalProperties: false,
  },
  generate: {
    type: "object",
    properties: { contenu: { type: "string" } },
    required: ["contenu"],
    additionalProperties: false,
  },
  variants: {
    type: "object",
    properties: {
      variantes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            titre: { type: "string" },
            accroche: { type: "string" },
            contenu: { type: "string" },
          },
          required: ["titre", "accroche", "contenu"],
          additionalProperties: false,
        },
      },
    },
    required: ["variantes"],
    additionalProperties: false,
  },
  calendar: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string" },
            reseau: { type: "string" },
            sujet: { type: "string" },
            angle: { type: "string" },
          },
          required: ["date", "reseau", "sujet", "angle"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  },
  coherence: {
    type: "object",
    properties: {
      score: { type: "integer" },
      niveau: { type: "string" },
      points_forts: { type: "array", items: { type: "string" } },
      points_amelioration: { type: "array", items: { type: "string" } },
      resume: { type: "string" },
    },
    required: ["score", "niveau", "points_forts", "points_amelioration", "resume"],
    additionalProperties: false,
  },
  tone: {
    type: "object",
    properties: {
      score: { type: "integer" },
      niveau: { type: "string" },
      resume: { type: "string" },
      ce_qui_correspond: { type: "array", items: { type: "string" } },
      ce_qui_ne_correspond_pas: { type: "array", items: { type: "string" } },
      version_corrigee: { type: "string" },
    },
    required: [
      "score", "niveau", "resume",
      "ce_qui_correspond", "ce_qui_ne_correspond_pas", "version_corrigee",
    ],
    additionalProperties: false,
  },
};

const MAX_TOKENS: Record<string, number> = {
  extract: 1000,
  generate: 2000,
  variants: 3000,
  calendar: 3500,
  coherence: 900,
  tone: 1200,
};

// ---- Mise en forme de la Brand Memory pour le prompt ---------------------
function brandMemoryBlock(m: BrandMemory | undefined): string {
  m = m || {};
  const list = (a?: string[]) => (a && a.length ? a.join(", ") : "—");
  return [
    `Ton : ${m.ton || "—"}`,
    `Mots-clés : ${list(m.mots_cles)}`,
    `Mots à éviter : ${list(m.mots_interdits)}`,
    `Cible : ${m.cible || "—"}`,
    `Valeurs : ${list(m.valeurs)}`,
  ].join("\n");
}

// ---- Construction du prompt utilisateur par action -----------------------
function buildUserPrompt(action: string, p: Payload): string {
  const brand = p.brand || {};
  const mem = brand.brand_memory || p.brandMemory;
  const nom = brand.nom || "la marque";
  const secteur = brand.secteur || "secteur non précisé";

  switch (action) {
    case "extract":
      return (
        "Analyse le contenu de marque ci-dessous et extrais sa voix de marque.\n" +
        "- ton : 1 à 3 adjectifs/expressions qui décrivent le ton réel du texte.\n" +
        "- mots_cles : 4 à 6 mots-clés saillants, propres à cette marque.\n" +
        "- mots_interdits : 3 à 4 clichés marketing ou termes à bannir pour rester crédible.\n" +
        "- cible : la cible/audience déduite, en une courte phrase.\n" +
        "- valeurs : 2 à 4 valeurs portées par la marque.\n\n" +
        "CONTENU DE MARQUE :\n\"\"\"\n" + (p.contenu || "").slice(0, 12000) + "\n\"\"\""
      );

    case "generate":
      return (
        `Rédige UN contenu prêt à publier pour la marque « ${nom} » (${secteur}).\n` +
        `Canal / format demandé : « ${p.format || "post"} ».\n` +
        `Sujet : « ${p.sujet || ""} ».\n\n` +
        "VOIX DE MARQUE À RESPECTER :\n" + brandMemoryBlock(mem) + "\n\n" +
        "Adapte la longueur, la structure et les codes au format demandé " +
        "(emojis, hashtags, objet d'email, slides de carrousel, etc. selon le cas). " +
        "Intègre naturellement les mots-clés, n'utilise jamais les mots à éviter. " +
        "Renvoie le texte final dans le champ contenu (sauts de ligne réels)."
      );

    case "variants": {
      const channel = p.channel || p.format || "réseau social";
      return (
        `Propose 3 VARIANTES distinctes d'un contenu pour la marque « ${nom} » (${secteur}).\n` +
        `Canal : « ${channel} ». Format : « ${p.format || ""} ». Sujet : « ${p.sujet || ""} ».\n\n` +
        "VOIX DE MARQUE À RESPECTER :\n" + brandMemoryBlock(mem) + "\n\n" +
        "Les 3 variantes doivent suivre 3 approches différentes :\n" +
        "1) Storytelling — 2) Direct & Liste — 3) Question/engagement.\n" +
        "Pour chacune : titre (le nom de l'approche), accroche (la 1re ligne, courte) " +
        "et contenu (le post complet prêt à publier, sauts de ligne réels). " +
        "Respecte les codes du canal et la voix de marque."
      );
    }

    case "calendar": {
      const count = calendarCount(p.periode, p.freq);
      const reseaux = (p.reseaux && p.reseaux.length ? p.reseaux : ["LinkedIn"]).join(", ");
      const pas = p.periode === "mois" ? 2 : 1;
      return (
        `Construis un calendrier éditorial de ${count} publications pour la marque ` +
        `« ${nom} » (${secteur}).\n` +
        `Réseaux à utiliser (répartis-les en rotation) : ${reseaux}.\n` +
        `Période : ${p.periode || "semaine"}.\n\n` +
        "VOIX DE MARQUE :\n" + brandMemoryBlock(mem) + "\n\n" +
        `Renvoie ${count} items. Pour chaque item :\n` +
        `- date : au format relatif « J+N » (commence à J+${pas} puis incrémente de ${pas} en ${pas}).\n` +
        "- reseau : l'un des réseaux listés (en rotation).\n" +
        "- sujet : une idée de publication concrète, spécifique à la marque.\n" +
        "- angle : l'angle éditorial (ex. Storytelling, Pédagogique, Preuve sociale, " +
        "Engagement, Inspiration, Expertise)."
      );
    }

    case "coherence":
      return (
        "Évalue la cohérence du CONTENU ci-dessous avec la voix de marque.\n\n" +
        "VOIX DE MARQUE :\n" + brandMemoryBlock(mem) + "\n\n" +
        "CONTENU À ÉVALUER :\n\"\"\"\n" + (p.contenu || "") + "\n\"\"\"\n\n" +
        "Renvoie : score (0 à 100), niveau (Excellent ≥86, Bon ≥71, Correct ≥51, " +
        "Faible sinon), resume (1 phrase), points_forts (2 à 3), " +
        "points_amelioration (0 à 2, vide si score > 90)."
      );

    case "tone":
      return (
        "Analyse si le TEXTE ci-dessous respecte la voix de marque, puis propose une " +
        "version corrigée.\n\n" +
        "VOIX DE MARQUE :\n" + brandMemoryBlock(mem) + "\n\n" +
        "TEXTE À ANALYSER :\n\"\"\"\n" + (p.texte || "") + "\n\"\"\"\n\n" +
        "Renvoie : score (0 à 100), niveau (Excellent ≥86, Bon ≥71, Correct ≥51, " +
        "Faible sinon), resume (1 phrase), ce_qui_correspond (2 à 3 points), " +
        "ce_qui_ne_correspond_pas (1 à 3 points), version_corrigee (le texte réécrit " +
        "pour coller parfaitement à la voix de marque)."
      );

    default:
      return "";
  }
}

// Même formule que le front (callCalendar) pour le nombre d'items.
function calendarCount(periode?: string, freq?: string): number {
  if (freq === "quotidien") return periode === "mois" ? 20 : 7;
  const n = parseInt(String(freq || "1"), 10) || 1;
  return periode === "mois" ? n * 4 : n;
}

// ---- Appel Anthropic ------------------------------------------------------
async function callClaude(
  key: string,
  action: string,
  userPrompt: string,
): Promise<unknown> {
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS[action] || 1500,
    system: SYSTEM_BASE,
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: { type: "json_schema", schema: SCHEMAS[action] } },
  };

  const r = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`anthropic ${r.status}: ${detail.slice(0, 300)}`);
  }

  const data = await r.json();
  const block = (data.content || []).find((b: { type?: string }) => b.type === "text");
  const text = block?.text || "";
  return JSON.parse(text);
}

// ---- Handler --------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" });

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ ok: false, reason: "missing_key" });

  let payload: Payload;
  let action = "";
  try {
    const b = await req.json();
    action = String(b.action || "");
    payload = (b.payload || {}) as Payload;
  } catch (_) {
    return json({ ok: false, reason: "bad_request" });
  }

  if (!SCHEMAS[action]) return json({ ok: false, reason: "unknown_action" });

  try {
    const userPrompt = buildUserPrompt(action, payload);
    const data = await callClaude(key, action, userPrompt);
    return json({ ok: true, data });
  } catch (e) {
    return json({ ok: false, reason: "ai_error", detail: String(e).slice(0, 300) });
  }
});

// ---- Types ----------------------------------------------------------------
interface BrandMemory {
  ton?: string;
  mots_cles?: string[];
  mots_interdits?: string[];
  cible?: string;
  valeurs?: string[];
}
interface Brand {
  nom?: string;
  secteur?: string;
  brand_memory?: BrandMemory;
}
interface Payload {
  brand?: Brand;
  brandMemory?: BrandMemory;
  contenu?: string;
  texte?: string;
  sujet?: string;
  format?: string;
  channel?: string;
  periode?: string;
  reseaux?: string[];
  freq?: string;
}
