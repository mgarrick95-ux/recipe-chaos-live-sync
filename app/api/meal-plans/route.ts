// app/api/meal-plans/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PlanSlot = {
  slotId: string;
  recipeId: string | null;
  locked: boolean;
  sideRecipeId: string | null;
};

function startOfWeekMonday(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay(); // 0=Sun,1=Mon...
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function coerceSlots(value: any, fallbackCount = 7): PlanSlot[] {
  // Old format: string[] of recipeIds
  if (Array.isArray(value) && value.every((v) => typeof v === "string" || v == null)) {
    const arr = value as (string | null)[];
    return arr.map((rid, i) => ({
      slotId: `slot-${i}-${Date.now()}`,
      recipeId: rid ?? null,
      locked: false,
      sideRecipeId: null,
    }));
  }

  // New format: PlanSlot[]
  if (Array.isArray(value) && value.every((v) => v && typeof v === "object")) {
    return (value as any[]).map((s, i) => ({
      slotId: String(s.slotId ?? `slot-${i}-${Date.now()}`),
      recipeId: s.recipeId ? String(s.recipeId) : null,
      locked: Boolean(s.locked),
      sideRecipeId: s.sideRecipeId ? String(s.sideRecipeId) : null,
    }));
  }

  // Default empty slots
  return Array.from({ length: fallbackCount }).map((_, i) => ({
    slotId: `slot-${i}-${Date.now()}`,
    recipeId: null,
    locked: false,
    sideRecipeId: null,
  }));
}

export async function GET() {
  try {
    const now = new Date();
    const start = startOfWeekMonday(now);
    const end = addDays(start, 6);

    const start_date = toISODate(start);
    const end_date = toISODate(end);

    const { data: existing, error: selErr } = await supabaseAdmin
      .from("meal_plans")
      .select("*")
      .eq("start_date", start_date)
      .maybeSingle();

    if (selErr) throw selErr;

    if (existing) {
      // Ensure slots exist
      const meal_count = Number(existing.meal_count ?? 7);
      const slots = coerceSlots(existing.selected_recipe_ids, meal_count);
      return NextResponse.json({
        ok: true,
        plan: { ...existing, meal_count, selected_recipe_ids: slots },
      });
    }

    const payload = {
      name: "This Week",
      start_date,
      end_date,
      meal_count: 7,
      selected_recipe_ids: coerceSlots([], 7),
    };

    const { data: created, error: insErr } = await supabaseAdmin
      .from("meal_plans")
      .insert(payload)
      .select("*")
      .single();

    if (insErr) throw insErr;

    return NextResponse.json({ ok: true, plan: created });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load meal plan" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const meal_count =
      typeof body?.meal_count === "number"
        ? Math.max(0, Math.min(60, Math.floor(body.meal_count)))
        : 7;

    const slots = coerceSlots(body?.selected_recipe_ids, meal_count);

    const now = new Date();
    const start = startOfWeekMonday(now);
    const end = addDays(start, 6);

    const start_date = toISODate(start);
    const end_date = toISODate(end);

    const payload = {
      name: "This Week",
      start_date,
      end_date,
      meal_count,
      selected_recipe_ids: slots,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("meal_plans")
      .upsert(payload, { onConflict: "start_date" })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, plan: data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to save meal plan" },
      { status: 500 }
    );
  }
}
