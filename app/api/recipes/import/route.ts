// app/api/recipes/import/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type ImportBody = {
  url?: string;
  title?: string;
};

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function deriveHost(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function stripTags(html: string): string {
  // Very lightweight sanitizer (not perfect, but safe enough for readable text)
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = noScript
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (raw) blocks.push(raw);
  }
  return blocks;
}

function normalizeToArray<T>(v: T | T[] | null | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function pickRecipeNodeFromJsonLd(json: any): any | null {
  // JSON-LD can be: object, array, or { @graph: [...] }
  const candidates: any[] = [];

  const pushNode = (node: any) => {
    if (!node || typeof node !== "object") return;
    candidates.push(node);
  };

  if (Array.isArray(json)) {
    json.forEach(pushNode);
  } else if (json && typeof json === "object") {
    if (Array.isArray(json["@graph"])) json["@graph"].forEach(pushNode);
    pushNode(json);
  }

  // Some nodes wrap the Recipe in "mainEntity"
  const expanded: any[] = [];
  for (const c of candidates) {
    expanded.push(c);
    if (c.mainEntity) {
      normalizeToArray(c.mainEntity).forEach((n) => expanded.push(n));
    }
  }

  const isRecipeType = (t: any) => {
    if (!t) return false;
    if (typeof t === "string") return t.toLowerCase() === "recipe";
    if (Array.isArray(t)) return t.some((x) => typeof x === "string" && x.toLowerCase() === "recipe");
    return false;
  };

  const recipe = expanded.find((n) => isRecipeType(n["@type"]));
  return recipe ?? null;
}

function asString(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

function asStringArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v.map((x) => asString(x)).filter(Boolean);
  }
  if (typeof v === "string") {
    // Sometimes instructions come as one blob
    return v
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [asString(v)].filter(Boolean);
}

function parseHowToSteps(v: any): string[] {
  // recipeInstructions can be:
  // - string
  // - array of strings
  // - array of HowToStep objects { text: "..." }
  // - nested objects
  if (!v) return [];
  if (typeof v === "string") return [v.trim()].filter(Boolean);

  if (Array.isArray(v)) {
    const out: string[] = [];
    for (const item of v) {
      if (typeof item === "string") {
        const s = item.trim();
        if (s) out.push(s);
        continue;
      }
      if (item && typeof item === "object") {
        // HowToStep
        const t = asString(item.text || item.name || item.description);
        if (t) out.push(t);
        // Some sites embed "itemListElement"
        if (item.itemListElement) {
          parseHowToSteps(item.itemListElement).forEach((x) => out.push(x));
        }
      }
    }
    return out.filter(Boolean);
  }

  if (v && typeof v === "object") {
    if (v.itemListElement) return parseHowToSteps(v.itemListElement);
    const t = asString(v.text || v.name || v.description);
    return t ? [t] : [];
  }

  return [];
}

function extractTitleFromHtml(html: string): string | null {
  // og:title
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (og?.[1]) return decodeHtmlEntities(og[1]).trim();

  // <title>
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (t?.[1]) return decodeHtmlEntities(t[1]).trim();

  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ImportBody;

    const url = safeTrim(body.url);
    const customTitle = safeTrim(body.title);

    if (!url) {
      return NextResponse.json({ error: "URL is required." }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Please enter a valid URL (including https://)." },
        { status: 400 }
      );
    }

    // Fetch the page server-side
    const res = await fetch(parsedUrl.toString(), {
      method: "GET",
      headers: {
        // Avoid some basic bot blocks
        "User-Agent":
          "Mozilla/5.0 (compatible; RecipeChaos/1.0; +https://localhost)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not fetch page (HTTP ${res.status}).` },
        { status: 400 }
      );
    }

    const html = await res.text();

    // 1) Try JSON-LD recipe
    let extractedTitle: string | null = null;
    let extractedIngredients: string[] = [];
    let extractedInstructions: string[] = [];

    const blocks = extractJsonLdBlocks(html);
    for (const b of blocks) {
      try {
        const json = JSON.parse(b);
        const recipeNode = pickRecipeNodeFromJsonLd(json);
        if (!recipeNode) continue;

        extractedTitle = asString(recipeNode.name) || extractedTitle;

        extractedIngredients =
          asStringArray(recipeNode.recipeIngredient) || extractedIngredients;

        extractedInstructions =
          parseHowToSteps(recipeNode.recipeInstructions) ||
          extractedInstructions;

        // If we found real ingredients or instructions, we’re good
        if (extractedIngredients.length > 0 || extractedInstructions.length > 0) {
          break;
        }
      } catch {
        // ignore broken blocks
      }
    }

    // 2) Fallback title from HTML if none
    if (!extractedTitle) extractedTitle = extractTitleFromHtml(html);

    const host = deriveHost(url);
    const finalTitle =
      customTitle ||
      extractedTitle ||
      (host ? `Imported recipe (${host})` : "Imported recipe");

    // “Readable” source text
    const sourceText = stripTags(html);

    const sourceName = host;

    const insertPayload: Record<string, any> = {
      title: finalTitle,
      source_url: url,
      source_name: sourceName,
      ingredients: extractedIngredients,
      instructions: extractedInstructions,
      source_text: sourceText,
      source_html: html,
    };

    const { data, error } = await supabaseServer
      .from("recipes")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Failed to create imported recipe." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        id: data.id,
        counts: {
          ingredients: extractedIngredients.length,
          instructions: extractedInstructions.length,
          sourceTextChars: sourceText.length,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unexpected error." },
      { status: 500 }
    );
  }
}
