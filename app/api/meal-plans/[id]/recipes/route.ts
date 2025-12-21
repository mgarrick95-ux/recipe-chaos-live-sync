// app/api/meal-plans/[id]/recipes/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const planId = params.id;

  const { data, error } = await supabaseAdmin
    .from("meal_plan_recipes")
    .select("recipe_id")
    .eq("meal_plan_id", planId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recipeIds: (data ?? []).map((r: any) => r.recipe_id) });
}

export async function POST(req: Request, { params }: Params) {
  // Body: { recipeIds: string[] }
  const planId = params.id;
  const body = await req.json().catch(() => ({}));
  const recipeIds: string[] = Array.isArray(body?.recipeIds) ? body.recipeIds : [];

  // Replace selection: delete all then insert new
  const { error: delErr } = await supabaseAdmin
    .from("meal_plan_recipes")
    .delete()
    .eq("meal_plan_id", planId);

  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }

  if (recipeIds.length > 0) {
    const rows = recipeIds.map((rid) => ({
      meal_plan_id: planId,
      recipe_id: rid,
    }));

    const { error: insErr } = await supabaseAdmin
      .from("meal_plan_recipes")
      .insert(rows);

    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
