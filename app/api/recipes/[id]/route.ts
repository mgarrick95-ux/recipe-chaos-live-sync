import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * PATCH contract:
 * Allowed writes:
 * - title
 * - description
 * - short_description
 * - favorite
 * - tags
 * - servings (accept serves/servings)
 * - prep_minutes
 * - cook_minutes
 * - ingredients (accept ingredients/ingredients_raw)
 * - steps (accept steps/instructions)
 * - notes
 * - source_url / source_name (ONLY if you truly have those columns; otherwise remove)
 *
 * IMPORTANT: Do NOT write image_url (you don't have that column)
 * IMPORTANT: Do NOT write instructions column (we store to steps)
 */

function normalizeToStringArray(value: unknown): string[] {
  if (!value) return [];

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];
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

export async function GET(_req: Request, context: { params: { id: string } }) {
  try {
    const id = context?.params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data, error } = await supabaseServer
      .from("recipes")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    return NextResponse.json({ recipe: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: { params: { id: string } }) {
  try {
    const id = context?.params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const update: any = {};

    if ("title" in body) update.title = String((body as any).title ?? "").trim();
    if ("description" in body) update.description = (body as any).description ?? null;
    if ("short_description" in body) update.short_description = (body as any).short_description ?? null;

    if ("favorite" in body) update.favorite = Boolean((body as any).favorite);

    if ("tags" in body) update.tags = normalizeToStringArray((body as any).tags);

    // servings: accept serves or servings
    if ("servings" in body || "serves" in body) {
      update.servings =
        toNumberOrNull((body as any).servings) ??
        toNumberOrNull((body as any).serves) ??
        null;
    }

    if ("prep_minutes" in body) update.prep_minutes = toNumberOrNull((body as any).prep_minutes);
    if ("cook_minutes" in body) update.cook_minutes = toNumberOrNull((body as any).cook_minutes);

    // ingredients
    if ("ingredients" in body || "ingredients_raw" in body) {
      update.ingredients = normalizeToStringArray(
        (body as any).ingredients ?? (body as any).ingredients_raw
      );
    }

    // steps (accept steps or instructions)
    if ("steps" in body || "instructions" in body || "instructions_raw" in body) {
      update.steps = normalizeToStringArray(
        (body as any).steps ?? (body as any).instructions ?? (body as any).instructions_raw
      );
    }

    if ("notes" in body) update.notes = (body as any).notes ?? null;

    // Only keep these if you are sure the columns exist in your DB.
    if ("source_url" in body) update.source_url = (body as any).source_url ?? null;
    if ("source_name" in body) update.source_name = (body as any).source_name ?? null;

    update.updated_at = new Date().toISOString();

    const { data, error } = await supabaseServer
      .from("recipes")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    return NextResponse.json({ recipe: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: { params: { id: string } }) {
  try {
    const id = context?.params?.id;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { error } = await supabaseServer.from("recipes").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
