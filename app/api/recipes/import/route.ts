import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type ImportRequest = {
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
    // Gentle fix for common invalid trailing commas:
    try {
      const fixed = value
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .trim();
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

function extractMeta(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m?.[1] ? cleanText(m[1]) : null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m?.[1]) return null;
  const t = cleanText(m[1]);
  return t || null;
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

function pickRecipeNode(jsonLd: any): any | null {
  const nodes = unwrapGraph(jsonLd).flatMap((n) => unwrapGraph(n));
  for (const node of nodes) {
    if (isRecipeType(node)) return node;
  }
  return null;
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

function extractDescription(recipeNode: any): string | null {
  const d = recipeNode?.description ?? recipeNode?.summary ?? null;
  if (!d) return null;
  const s = cleanText(String(d));
  return s || null;
}

function extractName(recipeNode: any): string | null {
  const n = recipeNode?.name ?? recipeNode?.headline ?? null;
  if (!n) return null;
  const s = cleanText(String(n));
  return s || null;
}

function extractIngredients(recipeNode: any): string[] {
  return normalizeStringArray(recipeNode?.recipeIngredient);
}

/**
 * STEP CLEANUP (the whole point of Step 2)
 */
function stripStepHeaders(line: string): string {
  // Remove leading "Directions:", "Instructions:", etc.
  return line
    .replace(/^\s*(directions|direction|instructions|instruction|method)\s*:\s*/i, "")
    .trim();
}

function splitNumberedBlob(text: string): string[] {
  // Split on common numbered formats:
  // "1. Do this" "2) Do that" "3 - Do next"
  const parts = text
    .split(/\s*(?:^|\n)\s*\d+\s*(?:[.)-])\s+/g)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [];
}

function splitByNewlines(text: string): string[] {
  const parts = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n+/g)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [];
}

function splitSentenceFallback(text: string): string[] {
  // Only used when it clearly looks like a blob and has multiple sentences.
  // This is intentionally conservative.
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 120) return [];
  const sentenceCount = (cleaned.match(/[.!?]\s+/g) || []).length;
  if (sentenceCount < 2) return [];

  const parts = cleaned
    .split(/(?<=[.!?])\s+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  // Avoid turning it into 30 micro-steps:
  if (parts.length < 2) return [];
  if (parts.length > 20) return []; // too fragmented
  return parts;
}

function normalizeSteps(rawSteps: string[]): string[] {
  const cleaned = (rawSteps || [])
    .map((s) => stripStepHeaders(cleanText(String(s))))
    .map((s) => s.replace(/^\s*[-•]+\s*/g, "").trim()) // bullet cleanup
    .filter(Boolean);

  if (cleaned.length === 0) return [];

  // If we got many steps already, just return them.
  if (cleaned.length >= 2) return cleaned;

  // If only one "blob", attempt smart splits
  const blob = cleaned[0];

  // 1) Split by newlines (common when JSON-LD packed a multi-line string)
  const nl = splitByNewlines(blob);
  if (nl.length >= 2) return nl;

  // 2) Split by numbering formats
  const numbered = splitNumberedBlob(blob);
  if (numbered.length >= 2) return numbered;

  // 3) Sentence fallback (only when safe)
  const sentences = splitSentenceFallback(blob);
  if (sentences.length >= 2) return sentences;

  // Keep as single step if we can't confidently split
  return [blob];
}

function extractInstructions(recipeNode: any): string[] {
  const ri = recipeNode?.recipeInstructions;
  if (!ri) return [];

  // Can be:
  // - string
  // - array of strings
  // - array of HowToStep objects { text: ... }
  // - array of HowToSection objects { itemListElement: [...] }
  let out: string[] = [];

  if (typeof ri === "string") {
    out = normalizeStringArray(ri);
    return normalizeSteps(out);
  }

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

      // Unknown object shape fallback
      const t = item?.text ?? item?.name ?? "";
      const cleaned = cleanText(String(t));
      if (cleaned) out.push(cleaned);
    }

    return normalizeSteps(out);
  }

  // Object fallback
  const fallback = ri?.text ?? ri?.name ?? "";
  out = normalizeStringArray(fallback);
  return normalizeSteps(out);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as ImportRequest | null;
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
          "Mozilla/5.0 (compatible; RecipeChaos/1.0; +https://localhost)",
        Accept: "text/html,application/xhtml+xml",
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

    const jsonBlocks = findJsonLdBlocks(html);

    let title: string | null = null;
    let description: string | null = null;
    let ingredients: string[] = [];
    let instructions: string[] = [];

    for (const block of jsonBlocks) {
      const json = safeJsonParse(block);
      if (!json) continue;

      const recipeNode = pickRecipeNode(json);
      if (!recipeNode) continue;

      title = extractName(recipeNode) || title;
      description = extractDescription(recipeNode) || description;
      ingredients = extractIngredients(recipeNode);
      instructions = extractInstructions(recipeNode);

      break;
    }

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

    const { data, error } = await supabaseServer
      .from("recipes")
      .insert({
        title,
        description,
        source_url: url,
        source_name: sourceName,
        ingredients: ingredients.length ? ingredients : null,
        instructions: instructions.length ? instructions : null,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      return NextResponse.json(
        { error: error?.message || "Insert failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: data.id,
      title,
      source_url: url,
      source_name: sourceName,
      ingredientsCount: ingredients.length,
      instructionsCount: instructions.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
