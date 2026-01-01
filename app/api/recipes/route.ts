import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Canonical API contract for RecipeChaos
 *
 * DB columns we write:
 * - title (string)
 * - description (string|null)
 * - short_description (string|null)
 * - tags (text[] or json array)
 * - favorite (boolean)
 * - servings (number|null)
 * - prep_minutes (number|null)
 * - cook_minutes (number|null)
 * - ingredients (array - ideally string[])
 * - steps (array - ideally string[])
 * - notes (string|null)
 * - source_url (string|null)   (optional if column exists)
 * - source_name (string|null)  (optional if column exists)
 *
 * IMPORTANT: We do NOT write image_url (you do not have that column).
 */

function normalizeToStringArray(value: unknown): string[] {
  if (!value) return [];

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];
    // split on newlines first; if no newlines, allow commas
    const parts = s.includes("\n") ? s.split("\n") : s.split(",");
    return parts.map((p) => p.trim()).filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v == null) return "";
        if (typeof v === "string") return v;
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        if (typeof v === "object") {
          const obj = v as any;
          return obj.name ?? obj.text ?? obj.value ?? obj.ingredient ?? obj.item ?? "";
        }
        return String(v);
      })
      .map((s) => String(s).trim())
      .filter(Boolean);
  }

  if (typeof value === "object") {
    const obj = value as any;
    const maybe = obj.items ?? obj.list ?? obj.values ?? obj.value ?? obj.text ?? null;
    if (maybe) return normalizeToStringArray(maybe);
  }

  return [];
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function GET() {
  const { data, error } = await supabaseServer
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    // Back-compat + canonical fields:
    const title = String((body as any).title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // tags: allow string, string[], object array
    const tags = normalizeToStringArray((body as any).tags);

    // servings: accept serves or servings
    const servings =
      toNumberOrNull((body as any).servings) ??
      toNumberOrNull((body as any).serves) ??
      null;

    const prep_minutes = toNumberOrNull((body as any).prep_minutes);
    const cook_minutes = toNumberOrNull((body as any).cook_minutes);

    // ingredients: accept ingredients, ingredients_raw, etc.
    const ingredients = normalizeToStringArray(
      (body as any).ingredients ?? (body as any).ingredients_raw ?? (body as any).ingredientsText
    );

    // steps: accept steps OR instructions (UI sometimes uses instructions)
    const steps = normalizeToStringArray(
      (body as any).steps ?? (body as any).instructions ?? (body as any).instructions_raw ?? (body as any).instructionsText
    );

    const insert: any = {
      title,
      description: (body as any).description ?? null,
      short_description: (body as any).short_description ?? null,
      tags,
      favorite: Boolean((body as any).favorite ?? false),
      servings,
      prep_minutes,
      cook_minutes,
      ingredients,
      steps,
      notes: (body as any).notes ?? null,
    };

    // Optional: only include if present (won’t break if DB lacks columns? If DB lacks, Supabase will error.)
    // If you are not 100% sure these columns exist, keep them OFF.
    if ("source_url" in (body as any)) insert.source_url = (body as any).source_url ?? null;
    if ("source_name" in (body as any)) insert.source_name = (body as any).source_name ?? null;

    const { data, error } = await supabaseServer
      .from("recipes")
      .insert(insert)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
