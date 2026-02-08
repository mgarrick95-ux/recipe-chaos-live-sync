// app/api/meal-plans/shopping-list/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseServer } from "@/lib/supabaseServer";

type PlanSlot = {
  slotId: string;
  recipeId: string | null;
  locked: boolean;
  sideRecipeId: string | null;
};

function normalizeName(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function tokens(s: string) {
  return normalizeName(s).split(" ").filter(Boolean);
}

function bestSubstitutes(missing: string, pantryNames: string[]) {
  const missT = new Set(tokens(missing));
  const scored = pantryNames
    .map((p) => {
      const pt = tokens(p);
      const overlap = pt.filter((t) => missT.has(t)).length;
      return { name: p, score: overlap };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.name);

  return scored;
}

export async function POST() {
  try {
    // Load this week's plan
    const start = toISODate(startOfWeekMonday(new Date()));

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("meal_plans")
      .select("*")
      .eq("start_date", start)
      .maybeSingle();

    if (planErr) throw planErr;
    if (!plan) return NextResponse.json({ ok: false, error: "No plan found" }, { status: 404 });

    const slots: PlanSlot[] = Array.isArray(plan.selected_recipe_ids) ? plan.selected_recipe_ids : [];
    const recipeIds = slots
      .flatMap((s) => [s.recipeId, s.sideRecipeId])
      .filter(Boolean) as string[];

    if (recipeIds.length === 0) {
      return NextResponse.json({ ok: true, added: 0, note: "No recipes selected" });
    }

    // Load recipes
    const { data: recipes, error: recErr } = await supabaseServer
      .from("recipes")
      .select("id,title,ingredients,tags")
      .in("id", recipeIds);

    if (recErr) throw recErr;

    // Load pantry/freezer
    const { data: storage, error: stErr } = await supabaseServer
      .from("storage_items")
      .select("name,quantity");

    if (stErr) throw stErr;

    const pantryNames = (storage ?? [])
      .filter((i: any) => Number(i.quantity ?? 0) > 0)
      .map((i: any) => String(i.name ?? "").trim())
      .filter(Boolean);

    const pantrySet = new Set(pantryNames.map(normalizeName));

    // Coverage + missing
    const missingSet = new Set<string>();
    const subs: Record<string, string[]> = {};
    const coverage: Record<string, { have: number; total: number; percent: number }> = {};

    for (const r of recipes ?? []) {
      const ing: string[] = Array.isArray((r as any).ingredients) ? (r as any).ingredients : [];
      const norm = ing.map(normalizeName).filter(Boolean);

      let have = 0;
      for (const n of norm) {
        if (pantrySet.has(n)) have++;
        else missingSet.add(n);
      }

      const total = norm.length;
      const percent = total === 0 ? 0 : Math.round((have / total) * 100);

      coverage[String((r as any).id)] = { have, total, percent };
    }

    // Build substitution suggestions for missing items
    for (const m of missingSet) {
      const suggestions = bestSubstitutes(m, pantryNames);
      if (suggestions.length > 0) subs[m] = suggestions;
    }

    // Insert missing into shopping list as derived
    let added = 0;
    for (const m of missingSet) {
      const name = m; // keep normalized; you could map back later if you want “pretty”
      const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/shopping-list/items`, {
        // This fallback may not exist in server env; so we'll insert directly instead of fetch.
      }).catch(() => null);

      // Direct insert (more reliable than fetch from server)
      const { error: insErr } = await supabaseServer
        .from("shopping_list_items")
        .insert([
          {
            user_id: null,
            name,
            normalized_name: normalizeName(name),
            source_type: "derived",
            source_recipe_id: null,
            checked: false,
            dismissed: false,
            quantity: 1,
          },
        ]);

      if (!insErr) added++;
    }

    return NextResponse.json({
      ok: true,
      added,
      missing_count: missingSet.size,
      coverage,
      substitutions: subs,
      note: "Added missing ingredients to shopping list",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to build shopping list" },
      { status: 500 }
    );
  }
}
