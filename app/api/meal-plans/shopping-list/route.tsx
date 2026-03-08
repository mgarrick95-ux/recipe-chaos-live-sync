// app/api/meal-plans/shopping-list/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeShoppingListIdentifier } from "@/lib/shopping/normalize";

type PlanSlot = {
  slotId: string;
  recipeId: string | null;
  locked: boolean;
  sideRecipeId: string | null;
};

// Used only for substitution scoring (NOT for shopping list identity)
function normalizeForScoring(input: string) {
  return (input || "")
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
  return normalizeForScoring(s).split(" ").filter(Boolean);
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

function supabaseFromCookies() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );
}

export async function POST() {
  try {
    // ✅ Authenticated supabase (respects RLS, gets user.id)
    const supabase = supabaseFromCookies();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    // Load this week's plan
    const start = toISODate(startOfWeekMonday(new Date()));

    // NOTE: Keeping your existing behavior (start_date only) to avoid schema assumptions.
    // If meal_plans has user_id, we should add `.eq("user_id", user.id)` later.
    const { data: plan, error: planErr } = await supabaseAdmin
      .from("meal_plans")
      .select("*")
      .eq("start_date", start)
      .maybeSingle();

    if (planErr) throw planErr;
    if (!plan) {
      return NextResponse.json({ ok: false, error: "No plan found" }, { status: 404 });
    }

    const slots: PlanSlot[] = Array.isArray(plan.selected_recipe_ids)
      ? plan.selected_recipe_ids
      : [];

    const recipeIds = slots
      .flatMap((s) => [s.recipeId, s.sideRecipeId])
      .filter(Boolean) as string[];

    if (recipeIds.length === 0) {
      return NextResponse.json({ ok: true, added: 0, note: "No recipes selected" });
    }

    // Load recipes (using authenticated client)
    const { data: recipes, error: recErr } = await supabase
      .from("recipes")
      .select("id,title,ingredients,tags")
      .in("id", recipeIds);

    if (recErr) throw recErr;

    // Load pantry/freezer (using authenticated client)
    const { data: storage, error: stErr } = await supabase
      .from("storage_items")
      .select("name,quantity");

    if (stErr) throw stErr;

    const pantryNames = (storage ?? [])
      .filter((i: any) => Number(i.quantity ?? 0) > 0)
      .map((i: any) => String(i.name ?? "").trim())
      .filter(Boolean);

    // ✅ Pantry set based on the SAME shopping normalizer
    const pantryKeySet = new Set(
      pantryNames.map((n) => normalizeShoppingListIdentifier(n).normalizedName)
    );

    // Coverage + missing
    // We store missing as a Map: normalized_key → display_name
    const missingMap = new Map<string, string>();
    const subs: Record<string, string[]> = {};
    const coverage: Record<string, { have: number; total: number; percent: number }> = {};

    for (const r of recipes ?? []) {
      const ing: string[] = Array.isArray((r as any).ingredients) ? (r as any).ingredients : [];

      let have = 0;
      let total = 0;

      for (const raw of ing) {
        const ident = normalizeShoppingListIdentifier(String(raw ?? ""));
        const key = ident.normalizedName;
        const display = ident.displayName;

        if (!key) continue;
        total++;

        if (pantryKeySet.has(key)) {
          have++;
        } else {
          // store the first display we see for that key
          if (!missingMap.has(key)) missingMap.set(key, display);
        }
      }

      const percent = total === 0 ? 0 : Math.round((have / total) * 100);
      coverage[String((r as any).id)] = { have, total, percent };
    }

    // Build substitution suggestions for missing items (display-based)
    for (const [_key, display] of missingMap.entries()) {
      const suggestions = bestSubstitutes(display, pantryNames);
      if (suggestions.length > 0) subs[display] = suggestions;
    }

    // Insert missing into shopping list as derived
    let added = 0;

    for (const [key, display] of missingMap.entries()) {
      // ✅ Insert with correct user_id + normalized_name + cleaned display name
      const { error: insErr } = await supabase
        .from("shopping_list_items")
        .insert([
          {
            user_id: user.id,
            name: display,
            normalized_name: key,
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
      missing_count: missingMap.size,
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


