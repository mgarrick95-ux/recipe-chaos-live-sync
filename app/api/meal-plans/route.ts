// app/api/meal-plans/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

export async function GET() {
  try {
    const now = new Date();
    const start = startOfWeekMonday(now);
    const end = addDays(start, 6);

    const start_date = toISODate(start);
    const end_date = toISODate(end);

    // IMPORTANT: maybeSingle() avoids "JSON object requested..." when 0 rows exist
    const { data: existing, error: selErr } = await supabaseAdmin
      .from("meal_plans")
      .select("*")
      .eq("start_date", start_date)
      .maybeSingle();

    if (selErr) throw selErr;

    if (existing) {
      return NextResponse.json({ ok: true, plan: existing });
    }

    const payload = {
      name: "This Week",
      start_date,
      end_date,
      selected_recipe_ids: [],
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
    const selected_recipe_ids = Array.isArray(body?.selected_recipe_ids)
      ? body.selected_recipe_ids
      : [];

    const now = new Date();
    const start = startOfWeekMonday(now);
    const end = addDays(start, 6);

    const start_date = toISODate(start);
    const end_date = toISODate(end);

    // Uses the unique index on start_date
    const payload = {
      name: "This Week",
      start_date,
      end_date,
      selected_recipe_ids,
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
