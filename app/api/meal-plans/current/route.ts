// app/api/meal-plans/current/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Monday-based start of week
function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day + 6) % 7; // Mon->0, Tue->1 ... Sun->6
  d.setDate(d.getDate() - diff);
  return d;
}

function endOfWeekSunday(startMonday: Date) {
  const d = new Date(startMonday);
  d.setDate(d.getDate() + 6);
  return d;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const startParam = url.searchParams.get("start"); // YYYY-MM-DD

    let start = startParam ? new Date(`${startParam}T00:00:00`) : startOfWeekMonday(new Date());
    if (Number.isNaN(start.getTime())) start = startOfWeekMonday(new Date());

    const startMonday = startOfWeekMonday(start);
    const endSunday = endOfWeekSunday(startMonday);

    const start_date = toISODate(startMonday);
    const end_date = toISODate(endSunday);

    // IMPORTANT:
    // Use maybeSingle() to avoid "JSON object requested, multiple (or no) rows returned"
    const { data, error } = await supabaseAdmin
      .from("meal_plans")
      .select("id,name,start_date,end_date,selected_recipe_ids,created_at,updated_at")
      .eq("start_date", start_date)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // If no row exists yet, return an empty plan payload (no error)
    if (!data) {
      return NextResponse.json({
        ok: true,
        plan: {
          id: null,
          name: "Selected Week",
          start_date,
          end_date,
          selected_recipe_ids: [],
        },
      });
    }

    return NextResponse.json({ ok: true, plan: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const selected_recipe_ids = body?.selected_recipe_ids ?? [];
    const name = body?.name ?? "Selected Week";

    const startParam = body?.start_date; // YYYY-MM-DD
    if (!startParam || typeof startParam !== "string") {
      return NextResponse.json({ ok: false, error: "start_date is required" }, { status: 400 });
    }

    const start = new Date(`${startParam}T00:00:00`);
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({ ok: false, error: "Invalid start_date" }, { status: 400 });
    }

    const startMonday = startOfWeekMonday(start);
    const endSunday = endOfWeekSunday(startMonday);

    const start_date = toISODate(startMonday);
    const end_date = toISODate(endSunday);

    // Upsert by start_date so each week is distinct
    const { data, error } = await supabaseAdmin
      .from("meal_plans")
      .upsert(
        {
          name,
          start_date,
          end_date,
          selected_recipe_ids,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "start_date" }
      )
      .select("id,name,start_date,end_date,selected_recipe_ids,created_at,updated_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, plan: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
