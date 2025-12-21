// app/api/recipes/paste/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type PasteRecipeBody = {
  url?: string;
  title?: string;
  ingredientsText?: string;
  instructionsText?: string;
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

function normalizeText(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function stripLinePrefix(line: string): string {
  let s = line.trim();

  // Common bullets
  s = s.replace(/^[-*•‣▪◦]+\s+/, "");

  // Common checkbox bullets
  s = s.replace(/^\[[ xX]\]\s+/, "");

  // Numbering: "1. ", "1) ", "(1) "
  s = s.replace(/^\(?\d+\)?[.)]\s+/, "");

  // Weird "Step 1:" style
  s = s.replace(/^step\s+\d+[:\-]\s+/i, "");

  return s.trim();
}

function splitToMeaningfulLines(block: string): string[] {
  const raw = normalizeText(block);
  if (!raw) return [];

  return raw
    .split("\n")
    .map((l) => stripLinePrefix(l))
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function splitInstructions(block: string): string[] {
  const raw = normalizeText(block);
  if (!raw) return [];

  // Prefer paragraph separation if present
  const hasBlankLines = /\n\s*\n/.test(raw);

  if (hasBlankLines) {
    return raw
      .split(/\n\s*\n+/)
      .map((p) => p.split("\n").map((l) => stripLinePrefix(l)).join(" "))
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  // Otherwise line-based
  return splitToMeaningfulLines(raw);
}

function removeLikelyHeader(lines: string[], headerWords: string[]): string[] {
  if (lines.length === 0) return lines;
  const first = lines[0].toLowerCase().replace(/[:\-–—]+$/g, "").trim();
  if (headerWords.includes(first)) return lines.slice(1);
  return lines;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PasteRecipeBody;

    const sourceUrl = safeTrim(body.url);
    let title = safeTrim(body.title);

    const ingredientsText = safeTrim(body.ingredientsText);
    const instructionsText = safeTrim(body.instructionsText);

    const parsedIngredients = removeLikelyHeader(
      splitToMeaningfulLines(ingredientsText),
      ["ingredients", "ingredient"]
    );

    const parsedInstructions = removeLikelyHeader(
      splitInstructions(instructionsText),
      ["instructions", "direction", "directions", "method"]
    );

    if (!title) {
      const host = sourceUrl ? deriveHost(sourceUrl) : null;
      title = host ? `Pasted recipe (${host})` : "Pasted recipe";
    }

    if (!title) {
      return NextResponse.json({ error: "Title is required." }, { status: 400 });
    }

    if (sourceUrl) {
      try {
        // eslint-disable-next-line no-new
        new URL(sourceUrl);
      } catch {
        return NextResponse.json(
          { error: "Please enter a valid URL (including https://)." },
          { status: 400 }
        );
      }
    }

    if (parsedIngredients.length === 0 && parsedInstructions.length === 0) {
      return NextResponse.json(
        { error: "Paste ingredients and/or instructions before saving." },
        { status: 400 }
      );
    }

    const sourceName = sourceUrl ? deriveHost(sourceUrl) : null;

    const insertPayload: Record<string, any> = {
      title,
      source_url: sourceUrl || null,
      source_name: sourceName,
      ingredients: parsedIngredients,
      instructions: parsedInstructions,
    };

    const { data, error } = await supabaseServer
      .from("recipes")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Failed to create pasted recipe." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        id: data.id,
        counts: { ingredients: parsedIngredients.length, instructions: parsedInstructions.length },
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
