// app/api/shopping-list/sync-derived/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function normalizeName(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ") // remove bracket noise like "[\"Bacon\"]"
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toStringArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/) // lines or commas
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function extractIngredientNamesFromIngredientsField(ingredientsField: any): string[] {
  // If your recipes.ingredients is an array of strings, this is perfect.
  // If it’s array of objects, we stringify and still keep something usable.
  const arr = toStringArray(ingredientsField);

  // Clean obvious wrapper strings like ["Milk"] -> Milk
  return arr
    .map((s) => s.replace(/^\[+|]+$/g, "").trim())
    .map((s) => s.replace(/^"+|"+$/g, "").trim())
    .filter(Boolean);
}

function startOfWeekMonday(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function POST() {
  try {
    // 1) Load this week's meal plan
    const now = new Date();
    const start = startOfWeekMonday(now);
    const start_date = toISODate(start);

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("meal_plans")
      .select("id, start_date, selected_recipe_ids")
      .eq("start_date", start_date)
      .maybeSingle();

    if (planErr) throw planErr;

    const selectedIds: string[] = Array.isArray(plan?.selected_recipe_ids)
      ? plan!.selected_recipe_ids
      : [];

    // 2) If nothing selected, clear derived and return list
    // NOTE: user_id is null (single-user, no auth) per your current setup.
    const user_id = null;

    // Clear old derived items first (keep manual)
    const { error: delErr } = await supabaseAdmin
      .from("shopping_list_items")
      .delete()
      .eq("source_type", "derived")
      .is("user_id", user_id);

    if (delErr) throw delErr;

    if (!selectedIds.length) {
      const { data: items, error: listErr } = await supabaseAdmin
        .from("shopping_list_items")
        .select("*")
        .is("user_id", user_id)
        .order("created_at", { ascending: false });

      if (listErr) throw listErr;

      return NextResponse.json({
        ok: true,
        derived_count: 0,
        total_items: items?.length ?? 0,
        items: items ?? [],
      });
    }

    // 3) Load only selected recipes (IMPORTANT: select ONLY columns that exist)
    const { data: recipes, error: recErr } = await supabaseAdmin
      .from("recipes")
      .select("id, ingredients")
      .in("id", selectedIds);

    if (recErr) throw recErr;

    // 4) Build derived items
    const derivedRows: any[] = [];
    for (const r of recipes ?? []) {
      const names = extractIngredientNamesFromIngredientsField((r as any).ingredients);

      for (const rawName of names) {
        const nn = normalizeName(rawName);
        if (!nn) continue;

        derivedRows.push({
          user_id,
          name: rawName,
          normalized_name: nn,
          source_type: "derived",
          source_recipe_id: (r as any).id,
          checked: false,
        });
      }
    }

    // Deduplicate by normalized_name (keep first)
    const seen = new Set<string>();
    const deduped = derivedRows.filter((row) => {
      if (seen.has(row.normalized_name)) return false;
      seen.add(row.normalized_name);
      return true;
    });

    // 5) Insert derived items
    if (deduped.length) {
      const { error: insErr } = await supabaseAdmin.from("shopping_list_items").insert(deduped);
      if (insErr) throw insErr;
    }

    // 6) Return full list
    const { data: items, error: listErr } = await supabaseAdmin
      .from("shopping_list_items")
      .select("*")
      .is("user_id", user_id)
      .order("created_at", { ascending: false });

    if (listErr) throw listErr;

    return NextResponse.json({
      ok: true,
      derived_count: deduped.length,
      total_items: items?.length ?? 0,
      items: items ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to sync derived items" },
      { status: 500 }
    );
  }
}
