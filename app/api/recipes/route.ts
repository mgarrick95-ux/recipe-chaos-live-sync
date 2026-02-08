// app/api/recipes/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Canonical API contract for RecipeChaos
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

/* =========================
   Auto-tagging
========================= */

function norm(s: string) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COURSE_TAGS = new Set(["main", "side", "breakfast", "dessert", "snack"]);

function hasCourseTag(tags: string[]) {
  const set = new Set(tags.map((t) => norm(t)));
  for (const c of COURSE_TAGS) if (set.has(c)) return true;
  return false;
}

function autoTagsFromContent(title: string, ingredients: string[], existingTags: string[]) {
  const t = norm(title);
  const ing = (ingredients || []).map(norm);

  const tags = new Set(existingTags.map((x) => norm(x)).filter(Boolean));

  const has = (kw: string[]) =>
    kw.some((k) => t.includes(k) || ing.some((i) => i.includes(k)));

  // course detection (strong rules)
  const dessert = has(["cookie", "cookies", "cake", "brownie", "cupcake", "pie", "tart", "ice cream", "pudding", "donut", "doughnut"]);
  const breakfast = has(["pancake", "pancakes", "waffle", "waffles", "omelet", "omelette", "french toast", "oatmeal", "granola", "cereal", "bagel", "breakfast"]);
  const snack = has(["snack", "appetizer", "starter", "chips", "dip", "salsa", "guacamole"]);
  const side = has(["fries", "slaw", "coleslaw", "cucumber salad", "side", "salad"]) && !has(["lasagna", "meatloaf", "casserole", "stew", "chili", "roast", "steak"]);

  const mainSignals = has([
    "lasagna",
    "meatloaf",
    "steak",
    "chicken",
    "pork",
    "salmon",
    "shrimp",
    "turkey",
    "casserole",
    "stew",
    "chili",
    "tacos",
    "burrito",
    "enchilada",
    "curry",
    "ramen",
    "pho",
    "pasta",
  ]);

  // Only auto-assign course if user didn't already specify one.
  if (!hasCourseTag(Array.from(tags))) {
    if (dessert) tags.add("dessert");
    else if (snack) tags.add("snack");
    else if (breakfast) tags.add("breakfast");
    else if (mainSignals) tags.add("main");
    else if (side) tags.add("side");
    else tags.add("main"); // default
  }

  // helpful extra tags (optional)
  if (has(["lasagna", "marinara", "parmesan", "pesto", "risotto", "italian"])) tags.add("italian");
  if (has(["taco", "tacos", "burrito", "enchilada", "quesadilla"])) tags.add("mexican");
  if (has(["stir fry", "teriyaki", "soy", "miso", "sesame", "kimchi"])) tags.add("asian");

  // “dinner” tag if it's a main (nice for filtering)
  if (tags.has("main")) tags.add("dinner");

  return Array.from(tags).filter(Boolean);
}

/* =========================
   Handlers
========================= */

export async function GET() {
  const { data, error } = await supabaseServer
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const title = String((body as any).title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

    const incomingTags = normalizeToStringArray((body as any).tags);
    const servings =
      toNumberOrNull((body as any).servings) ??
      toNumberOrNull((body as any).serves) ??
      null;

    const prep_minutes = toNumberOrNull((body as any).prep_minutes);
    const cook_minutes = toNumberOrNull((body as any).cook_minutes);

    const ingredients = normalizeToStringArray(
      (body as any).ingredients ??
        (body as any).ingredients_raw ??
        (body as any).ingredientsText
    );

    const steps = normalizeToStringArray(
      (body as any).steps ??
        (body as any).instructions ??
        (body as any).instructions_raw ??
        (body as any).instructionsText
    );

    // ✅ AUTO TAG HERE
    const finalTags = autoTagsFromContent(title, ingredients, incomingTags);

    const insert: any = {
      title,
      description: (body as any).description ?? null,
      short_description: (body as any).short_description ?? null,
      tags: finalTags,
      favorite: Boolean((body as any).favorite ?? false),
      servings,
      prep_minutes,
      cook_minutes,
      ingredients,
      steps,
      notes: (body as any).notes ?? null,
    };

    if ("source_url" in (body as any)) insert.source_url = (body as any).source_url ?? null;
    if ("source_name" in (body as any)) insert.source_name = (body as any).source_name ?? null;

    const { data, error } = await supabaseServer
      .from("recipes")
      .insert(insert)
      .select("id,tags")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
