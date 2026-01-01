import { NextResponse } from "next/server";

type PreviewRequest = {
  url: string;
};

function hostFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, " ");
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function cleanText(input: string): string {
  return normalizeWhitespace(stripHtmlTags(input || ""));
}

function safeJsonParse(value: string): any | null {
  try {
    return JSON.parse(value);
  } catch {
    try {
      const fixed = value.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").trim();
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m?.[1]) return null;
  const t = cleanText(m[1]);
  return t || null;
}

function extractMeta(html: string, key: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const v = cleanText(m[1]);
      if (v) return v;
    }
  }
  return null;
}

function findJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = (m[1] || "").trim();
    if (raw) blocks.push(raw);
  }
  return blocks;
}

function findNextDataJson(html: string): any | null {
  // Next.js payload:
  // <script id="__NEXT_DATA__" type="application/json">...</script>
  const m = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!m?.[1]) return null;
  const raw = m[1].trim();
  if (!raw) return null;
  return safeJsonParse(raw);
}

function normalizeStringArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        typeof v === "string" ? v : v?.text ?? v?.name ?? String(v)
      )
      .map((s) => cleanText(String(s)))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    const s = cleanText(value);
    return s ? [s] : [];
  }
  return [];
}

function isRecipeType(node: any): boolean {
  const t = node?.["@type"];
  if (!t) return false;
  if (typeof t === "string") return t.toLowerCase() === "recipe";
  if (Array.isArray(t))
    return t.some((x) => String(x).toLowerCase() === "recipe");
  return false;
}

function unwrapGraph(json: any): any[] {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (json["@graph"] && Array.isArray(json["@graph"])) return json["@graph"];
  return [json];
}

function deepFindRecipeNode(root: any): any | null {
  const visited = new Set<any>();

  function score(node: any): number {
    if (!node || typeof node !== "object") return 0;
    let s = 0;
    if (isRecipeType(node)) s += 1000;
    if (Array.isArray(node.recipeIngredient) && node.recipeIngredient.length)
      s += 500;
    if (node.recipeInstructions) s += 200;
    if (node.name) s += 50;
    return s;
  }

  let best: { node: any; score: number } | null = null;

  function walk(node: any) {
    if (!node || typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);

    const sc = score(node);
    if (sc > 0) {
      if (!best || sc > best.score) best = { node, score: sc };
    }

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    if (node["@graph"]) walk(node["@graph"]);
    if (node.mainEntity) walk(node.mainEntity);
    if (node.mainEntityOfPage) walk(node.mainEntityOfPage);

    for (const k of Object.keys(node)) {
      const v = (node as any)[k];
      if (typeof v === "object") walk(v);
    }
  }

  const nodes = unwrapGraph(root).flatMap((n) => unwrapGraph(n));
  for (const n of nodes) walk(n);

  return best?.node ?? null;
}

function extractName(recipeNode: any): string | null {
  const n = recipeNode?.name ?? recipeNode?.headline ?? null;
  if (!n) return null;
  const s = cleanText(String(n));
  return s || null;
}

function extractDescription(recipeNode: any): string | null {
  const d = recipeNode?.description ?? recipeNode?.summary ?? null;
  if (!d) return null;
  const s = cleanText(String(d));
  return s || null;
}

function extractIngredients(recipeNode: any): string[] {
  return normalizeStringArray(recipeNode?.recipeIngredient);
}

function normalizeSteps(rawSteps: string[]): string[] {
  const cleaned = (rawSteps || [])
    .map((s) => cleanText(String(s)))
    .map((s) => s.replace(/^\s*(directions|instructions|method)\s*:\s*/i, ""))
    .map((s) => s.replace(/^\s*[-•]+\s*/g, "").trim())
    .filter(Boolean);

  if (cleaned.length === 0) return [];
  if (cleaned.length >= 2) return cleaned;

  const blob = cleaned[0];

  const byBlankLines = blob
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n\s*\n+/g)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (byBlankLines.length >= 2) return byBlankLines;

  const byLines = blob
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n+/g)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byLines.length >= 2) return byLines;

  const byNumbered = blob
    .split(/\s*(?:^|\n)\s*\d+\s*(?:[.)-])\s+/g)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byNumbered.length >= 2) return byNumbered;

  if (blob.length > 160 && (blob.match(/[.!?]\s+/g) || []).length >= 2) {
    const bySentences = blob
      .split(/(?<=[.!?])\s+/g)
      .map((p) => p.trim())
      .filter(Boolean);
    if (bySentences.length >= 2 && bySentences.length <= 20)
      return bySentences;
  }

  return [blob];
}

function extractInstructions(recipeNode: any): string[] {
  const ri = recipeNode?.recipeInstructions;
  if (!ri) return [];

  let out: string[] = [];

  if (typeof ri === "string") return normalizeSteps(normalizeStringArray(ri));

  if (Array.isArray(ri)) {
    for (const item of ri) {
      if (!item) continue;

      if (typeof item === "string") {
        out.push(cleanText(item));
        continue;
      }

      const type = item?.["@type"];
      const lowerType = type ? String(type).toLowerCase() : "";

      if (lowerType === "howtostep") {
        const t = item?.text ?? item?.name ?? "";
        const cleaned = cleanText(String(t));
        if (cleaned) out.push(cleaned);
        continue;
      }

      if (lowerType === "howtosection") {
        const elements = item?.itemListElement;
        if (Array.isArray(elements)) {
          for (const el of elements) {
            if (typeof el === "string") {
              const cleaned = cleanText(el);
              if (cleaned) out.push(cleaned);
            } else {
              const t = el?.text ?? el?.name ?? "";
              const cleaned = cleanText(String(t));
              if (cleaned) out.push(cleaned);
            }
          }
        }
        continue;
      }

      const t = item?.text ?? item?.name ?? "";
      const cleaned = cleanText(String(t));
      if (cleaned) out.push(cleaned);
    }

    return normalizeSteps(out);
  }

  const fallback = ri?.text ?? ri?.name ?? "";
  return normalizeSteps(normalizeStringArray(fallback));
}

/**
 * AllRecipes (Next.js) fallback:
 * Look in __NEXT_DATA__ for a node that looks like a recipe.
 */
function extractFromNextData(nextData: any): {
  title: string | null;
  description: string | null;
  ingredients: string[];
  instructions: string[];
} | null {
  if (!nextData || typeof nextData !== "object") return null;

  // We don’t assume a fixed schema; we just deep-find a recipe-ish node.
  const recipeNode = deepFindRecipeNode(nextData);
  if (!recipeNode) return null;

  const ingredients = extractIngredients(recipeNode);
  const instructions = extractInstructions(recipeNode);
  const title = extractName(recipeNode);
  const description = extractDescription(recipeNode);

  const looksUseful = ingredients.length > 0 || instructions.length > 0 || !!title;
  if (!looksUseful) return null;

  return { title: title ?? null, description: description ?? null, ingredients, instructions };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as PreviewRequest | null;
    const url = body?.url?.trim();

    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const res = await fetch(parsed.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RecipeChaos/1.0",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Fetch failed (${res.status})` },
        { status: 400 }
      );
    }

    const html = await res.text();

    let title: string | null = null;
    let description: string | null = null;
    let ingredients: string[] = [];
    let instructions: string[] = [];

    // 1) JSON-LD (many sites)
    const jsonBlocks = findJsonLdBlocks(html);
    for (const block of jsonBlocks) {
      const json = safeJsonParse(block);
      if (!json) continue;

      const recipeNode = deepFindRecipeNode(json);
      if (!recipeNode) continue;

      const nodeIngs = extractIngredients(recipeNode);
      const nodeSteps = extractInstructions(recipeNode);

      const looksLikeRecipe =
        nodeIngs.length > 0 || nodeSteps.length > 0 || isRecipeType(recipeNode);

      if (!looksLikeRecipe) continue;

      title = extractName(recipeNode) || title;
      description = extractDescription(recipeNode) || description;
      ingredients = nodeIngs;
      instructions = nodeSteps;
      break;
    }

    // 2) Next.js payload (AllRecipes often)
    if (ingredients.length === 0 && instructions.length === 0) {
      const nextData = findNextDataJson(html);
      const nextExtract = extractFromNextData(nextData);
      if (nextExtract) {
        title = nextExtract.title || title;
        description = nextExtract.description || description;
        ingredients = nextExtract.ingredients;
        instructions = nextExtract.instructions;
      }
    }

    // 3) Meta/title fallbacks
    if (!title) {
      title =
        extractMeta(html, "og:title") ||
        extractMeta(html, "twitter:title") ||
        extractTitle(html) ||
        "Clipped recipe";
    }

    if (!description) {
      description =
        extractMeta(html, "og:description") ||
        extractMeta(html, "twitter:description") ||
        null;
    }

    const sourceHost = hostFromUrl(url);
    const sourceName = sourceHost || null;

    return NextResponse.json({
      title,
      description,
      source_url: url,
      source_name: sourceName,
      ingredients: ingredients ?? [],
      instructions: instructions ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
