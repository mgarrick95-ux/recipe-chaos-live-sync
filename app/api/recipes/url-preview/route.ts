// app/api/recipes/url-preview/route.ts
import { NextResponse } from "next/server";

type PreviewResult = {
  title: string;
  description?: string | null;
  ingredients: string[];
  instructions: string[];
  source_url: string;
  source_name?: string | null;
  source_text?: string | null;
};

function hostFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function safeJsonParse(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function pickRecipeNode(ld: any): any | null {
  if (!ld) return null;

  const isRecipe = (node: any) => {
    const t = node?.["@type"];
    if (!t) return false;
    if (Array.isArray(t)) return t.includes("Recipe");
    return t === "Recipe";
  };

  const visit = (node: any): any | null => {
    if (!node) return null;

    if (Array.isArray(node)) {
      for (const x of node) {
        const found = visit(x);
        if (found) return found;
      }
      return null;
    }

    if (typeof node === "object") {
      if (isRecipe(node)) return node;

      if (node["@graph"]) {
        const found = visit(node["@graph"]);
        if (found) return found;
      }

      for (const k of Object.keys(node)) {
        const found = visit(node[k]);
        if (found) return found;
      }
    }

    return null;
  };

  return visit(ld);
}

function extractLdJsonBlocks(html: string): any[] {
  const blocks: any[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1]?.trim();
    if (!raw) continue;

    const parsed = safeJsonParse(raw);
    if (parsed) {
      blocks.push(parsed);
      continue;
    }

    // Some sites jam multiple JSON objects or add trailing junk. Try a minimal cleanup.
    const cleaned = raw.replace(/^\s*<!--/, "").replace(/-->\s*$/, "").trim();
    const parsed2 = safeJsonParse(cleaned);
    if (parsed2) blocks.push(parsed2);
  }

  return blocks;
}

function toStringArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value))
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  return [String(value)].map((s) => s.trim()).filter(Boolean);
}

function normalizeInstructions(value: any): string[] {
  if (!value) return [];

  if (typeof value === "string") {
    const t = normalizeText(stripHtml(value));
    const parts = /\n\s*\n/.test(t) ? t.split(/\n\s*\n+/) : t.split("\n");
    return parts.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  }

  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const v of value) {
      if (typeof v === "string") out.push(stripHtml(v));
      else if (v?.text) out.push(stripHtml(String(v.text)));
      else if (v?.name) out.push(stripHtml(String(v.name)));
      else out.push(stripHtml(String(v)));
    }
    return out
      .map((s) => normalizeText(s).replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  if (typeof value === "object") {
    if (value.text) return normalizeInstructions(value.text);
  }

  return [];
}

// --- Light cleanup helpers (safe, no “smart enforcement”) ---
function decodeCommonEntities(s: string): string {
  return (s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\u00A0/g, " "); // nbsp
}

function cleanTitle(raw: string, host: string | null): string {
  let s = decodeCommonEntities(stripHtml(String(raw || ""))).trim();
  s = s.replace(/\s+/g, " ").trim();

  if (!s) return host ? `Clipped recipe (${host})` : "Clipped recipe";

  // Remove obvious suffix glue: "Title - Site", "Title | Site", "Title • Site"
  // BUT only if the right side looks like a site-ish label.
  const parts = s.split(/\s[|•–-]\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const left = parts[0];
    const right = parts[parts.length - 1];

    const hostLike =
      host &&
      right
        .toLowerCase()
        .includes(host.toLowerCase().replace(/^www\./, ""));

    const rightLooksLikeSite =
      right.length <= 30 &&
      (/\.(com|net|org|co|io|ca|uk|au)\b/i.test(right) ||
        /\b(recipe|recipes|kitchen|food|cooking)\b/i.test(right) ||
        hostLike);

    if (left.length >= 6 && rightLooksLikeSite) {
      s = left;
    }
  }

  // Tidy trailing punctuation spam
  s = s.replace(/[•|\-–—:]+$/g, "").trim();
  s = s.replace(/[!?.]{3,}$/g, "!!").trim();

  // Clamp length
  if (s.length > 120) s = s.slice(0, 120).trim();

  return s || (host ? `Clipped recipe (${host})` : "Clipped recipe");
}

function cleanDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = decodeCommonEntities(stripHtml(String(raw))).trim();
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s.length > 260) s = s.slice(0, 260).trim();
  return s || null;
}

// --- Fractions prettifier (kept from your version)
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

function toNiceFraction(x: number): string {
  const sign = x < 0 ? "-" : "";
  const v = Math.abs(x);

  const whole = Math.floor(v);
  const frac = v - whole;

  const denom = 8;
  let num = Math.round(frac * denom);

  if (num === 0) return `${sign}${whole}`;
  if (num === denom) return `${sign}${whole + 1}`;

  const g = gcd(num, denom);
  num = num / g;
  const d = denom / g;

  const fracStr = `${num}/${d}`;
  if (whole === 0) return `${sign}${fracStr}`;
  return `${sign}${whole} ${fracStr}`;
}

function humanizeFractionsInLine(line: string): string {
  return line.replace(/(\d+\.\d{3,})/g, (m) => {
    const n = Number(m);
    if (!Number.isFinite(n)) return m;
    if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
    return toNiceFraction(n);
  });
}

function humanizeIngredientLines(lines: string[]): string[] {
  return lines
    .map((l) => humanizeFractionsInLine(l).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// --- URL cleanup: strip tracking parameters that cause weird redirects / blocks
function sanitizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const kill = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid",
      "mkt_tok",
    ];
    for (const k of kill) u.searchParams.delete(k);
    u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

type FetchAttempt = {
  ok: boolean;
  status: number;
  body: string;
  mode: "direct" | "fallback";
};

async function fetchDirect(url: string): Promise<FetchAttempt> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body, mode: "direct" };
}

// Fallback: r.jina.ai (reader/proxy). This often bypasses bot blocks.
async function fetchFallback(url: string): Promise<FetchAttempt> {
  const target =
    url.startsWith("https://") || url.startsWith("http://")
      ? url
      : `https://${url}`;
  const readerUrl = `https://r.jina.ai/${target}`;
  const res = await fetch(readerUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "text/plain,text/html,*/*",
    },
    redirect: "follow",
  });

  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body, mode: "fallback" };
}

// Parse “Ingredients” + “Instructions/Directions/Method” sections from plain text
function parseSectionsFromText(raw: string): {
  title: string;
  ingredients: string[];
  instructions: string[];
} {
  const text = normalizeText(raw);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let title =
    lines.find((l) => l.length >= 6 && l.length <= 120 && !/^\d/.test(l)) ||
    "Clipped recipe";

  const lower = lines.map((l) => l.toLowerCase());

  const ingKeys = ["ingredients"];
  const insKeys = ["instructions", "directions", "method", "preparation", "steps"];

  const ingIdx = lower.findIndex((l) => ingKeys.some((k) => l === k || l.includes(k)));
  const insIdx = lower.findIndex((l) => insKeys.some((k) => l === k || l.includes(k)));

  const ingredients: string[] = [];
  const instructions: string[] = [];

  if (ingIdx !== -1 && insIdx !== -1 && insIdx > ingIdx) {
    ingredients.push(...lines.slice(ingIdx + 1, insIdx));
    instructions.push(...lines.slice(insIdx + 1));
  } else {
    for (const l of lines) {
      if (/^\d+[\).\s]/.test(l)) instructions.push(l.replace(/^\d+[\).\s]*/, "").trim());
    }
  }

  return {
    title,
    ingredients: ingredients.slice(0, 250),
    instructions: instructions.slice(0, 250),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const rawUrl = body?.url ? String(body.url) : "";
    if (!rawUrl) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const url = sanitizeUrl(rawUrl);
    const host = hostFromUrl(url) || null;

    // 1) direct attempt
    const direct = await fetchDirect(url);

    let html = direct.body;
    let usedMode: "direct" | "fallback" = direct.mode;

    // 2) parse JSON-LD from direct HTML if possible
    let recipeNode: any | null = null;
    if (direct.ok && html) {
      const ldBlocks = extractLdJsonBlocks(html);
      for (const b of ldBlocks) {
        recipeNode = pickRecipeNode(b);
        if (recipeNode) break;
      }
    }

    const directBlocked = !direct.ok && (direct.status === 403 || direct.status === 404);
    const directNotHelpful = direct.ok && !recipeNode;

    if (directBlocked || directNotHelpful) {
      const fallback = await fetchFallback(url);
      if (fallback.ok && fallback.body) {
        html = fallback.body;
        usedMode = "fallback";

        const ldBlocks2 = extractLdJsonBlocks(html);
        for (const b of ldBlocks2) {
          recipeNode = pickRecipeNode(b);
          if (recipeNode) break;
        }
      } else {
        return NextResponse.json(
          {
            error: `Direct fetch failed (${direct.status}) and fallback failed (${fallback.status}).`,
          },
          { status: 400 }
        );
      }
    }

    // Title/description fallbacks
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const metaDescMatch = html.match(
      /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i
    );

    const rawTitle =
      (recipeNode?.name ? String(recipeNode.name) : null) ||
      (titleMatch ? stripHtml(titleMatch[1]) : null) ||
      `Clipped recipe (${host || "site"})`;

    const rawDescription =
      (recipeNode?.description ? String(recipeNode.description) : null) ||
      (metaDescMatch ? metaDescMatch[1] : null) ||
      null;

    // Primary: JSON-LD extraction
    let ingredientsRaw = toStringArray(recipeNode?.recipeIngredient);
    let ingredients = humanizeIngredientLines(ingredientsRaw);

    let instructions = normalizeInstructions(recipeNode?.recipeInstructions);

    // Last resort: parse sections from text when JSON-LD is missing/empty
    if ((!ingredients.length && !instructions.length) || (!recipeNode && usedMode === "fallback")) {
      const sectionParsed = parseSectionsFromText(html);
      if ((!rawTitle || rawTitle.startsWith("Clipped recipe")) && sectionParsed.title) {
        // rawTitle is const, so we just prefer it later in cleanTitle
      }
      if (!ingredients.length) ingredients = humanizeIngredientLines(sectionParsed.ingredients || []);
      if (!instructions.length) instructions = sectionParsed.instructions || [];
    }

    if (!ingredients.length && !instructions.length) {
      return NextResponse.json(
        {
          error:
            "Could not extract recipe data from that URL (site may block scraping or hide recipe content). Try a different source or use Manual/Photo.",
        },
        { status: 400 }
      );
    }

    const out: PreviewResult = {
      title: cleanTitle(rawTitle, host),
      description: cleanDescription(rawDescription),
      ingredients,
      instructions,
      source_url: url,
      source_name: host,
      source_text: null,
    };

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Preview failed" },
      { status: 500 }
    );
  }
}
