// app/api/shopping-list/sync-derived/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type AnyRecord = Record<string, any>;

export const dynamic = "force-dynamic";

/** ---------- cleaning helpers ---------- */
function normalizeFractionChars(raw: string): string {
  return (raw || "")
    .replace(/[\u2044\u2215\uFF0F]/g, "/") // ⁄ ∕ ／
    .replace(/\u00BC/g, " 1/4 ") // ¼
    .replace(/\u00BD/g, " 1/2 ") // ½
    .replace(/\u00BE/g, " 3/4 ") // ¾
    .replace(/\u2153/g, " 1/3 ") // ⅓
    .replace(/\u2154/g, " 2/3 ") // ⅔
    .replace(/\u215B/g, " 1/8 ") // ⅛
    .replace(/\u215C/g, " 3/8 ") // ⅜
    .replace(/\u215D/g, " 5/8 ") // ⅝
    .replace(/\u215E/g, " 7/8 "); // ⅞
}

function stripLeadingMeasurement(raw: string): string {
  let s = normalizeFractionChars(raw).trim();
  if (!s) return s;

  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[-•*]+\s*/, "").trim();

  // mixed fraction "1 1/2"
  s = s.replace(/^\d+\s+\d+\/\d+\s*/, "");
  // fraction "1/2"
  s = s.replace(/^\d+\/\d+\s*/, "");
  // decimal/int "2" "1.5"
  s = s.replace(/^\d+(\.\d+)?\s*/, "");

  s = s.replace(/^of\s+/i, "").trim();

  const unitPattern =
    /^(cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|ml|l|liter|litre|liters|litres|pinch|dash|clove|cloves|slice|slices|can|cans|package|packages|packet|packets)\b\.?\s*/i;
  if (unitPattern.test(s)) s = s.replace(unitPattern, "").trim();

  s = s.replace(/^(pinch|dash)\s+of\s+/i, "").trim();
  s = s.replace(/^\/\d+\s*/, "").trim();

  return s || normalizeFractionChars(raw).trim();
}

function stripTrailingNotes(display: string): string {
  let s = (display || "").trim();
  if (!s) return s;

  const parts = s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return s;

  const first = parts[0];
  const rest = parts
    .slice(1)
    .join(", ")
    .toLowerCase();

  const removable = [
    "divided",
    "melted",
    "softened",
    "room temperature",
    "to taste",
    "or to taste",
    "more to taste",
    "or more to taste",
    "as needed",
    "for serving",
    "for garnish",
    "optional",
    "chopped",
    "diced",
    "minced",
    "sliced",
    "grated",
    "shredded",
    "peeled",
    "seeded",
    "ground",
    "crushed",
    "drained",
    "rinsed",
    "fresh",
    "packed",
    "warm",
    "cold",
  ];

  const shouldStrip =
    removable.some((p) => rest.includes(p)) || rest.split(" ").length <= 4;
  return shouldStrip ? first : s;
}

function displayBaseName(raw: string) {
  const noMeasure = stripLeadingMeasurement(raw);
  const noNotes = stripTrailingNotes(noMeasure);
  return noNotes.trim() || (raw || "").trim();
}

function normalizeKey(input: string) {
  return (input || "")
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** ---------- ingredient extraction ---------- */
function extractIngredients(recipe: AnyRecord): string[] {
  const candidates = [
    recipe.ingredients,
    recipe.ingredients_json,
    recipe.ingredients_list,
    recipe.ingredientsText,
    recipe.ingredients_text,
    recipe.steps_ingredients, // extra fallback, harmless if absent
  ];

  for (const val of candidates) {
    if (!val) continue;

    if (Array.isArray(val)) {
      const out: string[] = [];
      for (const item of val) {
        if (!item) continue;
        if (typeof item === "string") out.push(item);
        else if (typeof item === "object") {
          const name =
            (item as any).name ??
            (item as any).ingredient ??
            (item as any).text ??
            (item as any).value ??
            (item as any).label ??
            null;
          if (typeof name === "string" && name.trim()) out.push(name);
        }
      }
      return out.map((s) => s.trim()).filter(Boolean);
    }

    if (typeof val === "string") {
      const lines = val
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (lines.length) return lines;
    }
  }

  return [];
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const recipeIdsRaw = body?.recipe_ids;

    if (!Array.isArray(recipeIdsRaw)) {
      return NextResponse.json(
        { error: "recipe_ids must be an array of recipe IDs (strings)" },
        { status: 400 }
      );
    }

    const recipe_ids: string[] = recipeIdsRaw
      .filter((x: any) => typeof x === "string")
      .map((s: string) => s.trim())
      .filter(Boolean);

    if (recipe_ids.length === 0) {
      return NextResponse.json({
        ok: true,
        added_count: 0,
        revived_count: 0,
        added: [],
        revived: [],
        note: "No recipe ids provided.",
      });
    }

    // 1) Fetch recipes
    const { data: recipes, error: recipesErr } = await supabaseServer
      .from("recipes")
      .select("*")
      .in("id", recipe_ids);

    if (recipesErr) {
      return NextResponse.json(
        { error: `Failed to load recipes: ${recipesErr.message}` },
        { status: 500 }
      );
    }

    // 2) Collect ingredients
    const allIngredientLines: { line: string; source_recipe_id: string }[] = [];
    for (const r of recipes ?? []) {
      const ingredients = extractIngredients(r as AnyRecord);
      for (const ing of ingredients) {
        const line = String(ing ?? "").trim();
        if (line)
          allIngredientLines.push({ line, source_recipe_id: (r as any).id });
      }
    }

    if (allIngredientLines.length === 0) {
      return NextResponse.json({
        ok: true,
        added_count: 0,
        revived_count: 0,
        added: [],
        revived: [],
        note:
          "No ingredients were found on the selected recipes. (They may be stored under a different field/table.)",
        debug: {
          recipe_ids_count: recipe_ids.length,
          recipes_found: (recipes ?? []).length,
        },
      });
    }

    // 3) Normalize + de-dupe within this sync run
    // NOTE: Your DB schema is: quantity (text), unit (text), source_type (text), is_derived (boolean), dismissed (boolean)
    const seen = new Set<string>();
    const toSync: {
      user_id: string | null;
      name: string;
      normalized_name: string;
      quantity: string | null;
      unit: string | null;
      source_type: "derived";
      source_recipe_id: string | null;
      is_derived: boolean;
      checked: boolean;
      dismissed: boolean;
    }[] = [];

    for (const item of allIngredientLines) {
      const base = displayBaseName(item.line);
      const normalized_name = normalizeKey(base);
      if (!normalized_name) continue;

      if (seen.has(normalized_name)) continue;
      seen.add(normalized_name);

      toSync.push({
        user_id: null,
        name: base,
        normalized_name,
        quantity: null,
        unit: null,
        source_type: "derived",
        source_recipe_id: item.source_recipe_id ?? null,
        is_derived: true,
        checked: false,
        dismissed: false,
      });
    }

    if (toSync.length === 0) {
      return NextResponse.json({
        ok: true,
        added_count: 0,
        revived_count: 0,
        added: [],
        revived: [],
        note: "No usable ingredient lines after cleaning.",
      });
    }

    // 4) Check existing items (active vs dismissed)
    const normalizedToSync = toSync.map((x) => x.normalized_name);

    const { data: existing, error: existingErr } = await supabaseServer
      .from("shopping_list_items")
      .select("id,normalized_name,source_type,dismissed,checked,is_derived")
      .in("normalized_name", normalizedToSync);

    if (existingErr) {
      return NextResponse.json(
        { error: `Failed to check existing items: ${existingErr.message}` },
        { status: 500 }
      );
    }

    // Active means "currently visible unless user toggles showDismissed"
    const activeSet = new Set<string>();
    const derivedDismissedByNormalized = new Map<string, string>(); // normalized_name -> id

    for (const row of existing ?? []) {
      const nn = String((row as any)?.normalized_name ?? "").trim();
      if (!nn) continue;

      const dismissed = !!(row as any)?.dismissed;
      const sourceType = String((row as any)?.source_type ?? "");

      if (!dismissed) activeSet.add(nn);

      // If a derived item exists but is dismissed, we should revive it instead of claiming "already exists forever"
      if (dismissed && sourceType === "derived") {
        // keep the first id we see; good enough for revive
        if (!derivedDismissedByNormalized.has(nn)) {
          derivedDismissedByNormalized.set(nn, String((row as any)?.id));
        }
      }
    }

    const toReviveIds: string[] = [];
    const toInsert: typeof toSync = [];

    for (const item of toSync) {
      if (activeSet.has(item.normalized_name)) {
        continue; // already active in the list
      }

      const reviveId = derivedDismissedByNormalized.get(item.normalized_name);
      if (reviveId) {
        toReviveIds.push(reviveId);
        continue;
      }

      toInsert.push(item);
    }

    // 5) Revive dismissed derived rows (so sync is visible)
    let revived: any[] = [];
    if (toReviveIds.length > 0) {
      const { data: revivedRows, error: reviveErr } = await supabaseServer
        .from("shopping_list_items")
        .update({
          dismissed: false,
          checked: false,
          is_derived: true,
          source_type: "derived",
        })
        .in("id", toReviveIds)
        .select("id,name,normalized_name,source_type,source_recipe_id,checked,dismissed,is_derived");

      if (reviveErr) {
        return NextResponse.json(
          { error: `Failed to revive dismissed derived items: ${reviveErr.message}` },
          { status: 500 }
        );
      }
      revived = revivedRows ?? [];
    }

    // 6) Insert brand-new derived rows
    let inserted: any[] = [];
    if (toInsert.length > 0) {
      const { data: insertedRows, error: insertErr } = await supabaseServer
        .from("shopping_list_items")
        .insert(toInsert)
        .select("id,name,normalized_name,source_type,source_recipe_id,checked,dismissed,is_derived");

      if (insertErr) {
        return NextResponse.json(
          { error: `Insert failed: ${insertErr.message}` },
          { status: 500 }
        );
      }
      inserted = insertedRows ?? [];
    }

    const alreadyActiveCount = toSync.length - toReviveIds.length - toInsert.length;

    let note = "Synced derived items.";
    if (inserted.length === 0 && revived.length === 0) {
      note = "All derived items were already active.";
    } else if (inserted.length === 0 && revived.length > 0) {
      note = "Revived previously dismissed derived items.";
    } else if (inserted.length > 0 && revived.length === 0) {
      note = "Added new derived items.";
    } else {
      note = "Added new items and revived dismissed ones.";
    }

    return NextResponse.json({
      ok: true,
      added_count: inserted.length,
      revived_count: revived.length,
      added: inserted,
      revived,
      note,
      debug: {
        recipe_ids_count: recipe_ids.length,
        recipes_found: (recipes ?? []).length,
        unique_from_recipes: toSync.length,
        already_active: alreadyActiveCount,
        revived: revived.length,
        inserted: inserted.length,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown sync error" },
      { status: 500 }
    );
  }
}
