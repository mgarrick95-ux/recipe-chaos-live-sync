// app/api/meal-plans/usage/route.ts
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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const start = url.searchParams.get("start");

    if (!start) {
      return NextResponse.json({ ok: false, error: "start is required" }, { status: 400 });
    }

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

    if (recipeIds.length === 0) return NextResponse.json({ ok: true, usage: {} });

    const { data: recipes, error: recErr } = await supabaseServer
      .from("recipes")
      .select("id,ingredients")
      .in("id", recipeIds);

    if (recErr) throw recErr;

    const usage: Record<string, number> = {};

    for (const r of recipes ?? []) {
      const ing: string[] = Array.isArray((r as any).ingredients) ? (r as any).ingredients : [];
      for (const raw of ing) {
        const n = normalizeName(String(raw ?? ""));
        if (!n) continue;
        usage[n] = (usage[n] ?? 0) + 1; // “times used” (not units)
      }
    }

    return NextResponse.json({ ok: true, usage });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to compute usage" },
      { status: 500 }
    );
  }
}
