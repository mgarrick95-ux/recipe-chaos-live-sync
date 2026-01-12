// app/api/shopping-list/items/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function normalizeName(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Supabase may return bigint/numeric as string. Accept both.
function coercePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.floor(value);
    return n > 0 ? n : fallback;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return fallback;

    const n = Math.floor(parsed);
    return n > 0 ? n : fallback;
  }

  return fallback;
}

async function tryInsertWithSourceType(payload: any, source_type: string) {
  const { data, error } = await supabaseServer
    .from("shopping_list_items")
    .insert([{ ...payload, source_type }])
    .select(
      "id,user_id,name,normalized_name,source_type,source_recipe_id,checked,dismissed,quantity"
    )
    .single();

  return { data, error };
}

export async function GET() {
  const { data, error } = await supabaseServer
    .from("shopping_list_items")
    .select(
      "id,user_id,name,normalized_name,source_type,source_recipe_id,checked,dismissed,quantity"
    )
    .order("checked", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const nameRaw = String(body?.name ?? "").trim();

    if (!nameRaw) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const normalized = normalizeName(nameRaw);
    if (!normalized) {
      return NextResponse.json({ error: "name is invalid" }, { status: 400 });
    }

    const requestedQty = coercePositiveInt(body?.quantity, 1);

    // ✅ Only special-case: revive dismissed exact match
    const { data: dismissedExisting, error: dismissedErr } = await supabaseServer
      .from("shopping_list_items")
      .select(
        "id,user_id,name,normalized_name,source_type,source_recipe_id,checked,dismissed,quantity"
      )
      .eq("normalized_name", normalized)
      .eq("dismissed", true)
      .limit(1);

    if (dismissedErr) {
      return NextResponse.json({ error: dismissedErr.message }, { status: 500 });
    }

    if (dismissedExisting && dismissedExisting.length > 0) {
      const ex = dismissedExisting[0] as any;

      const existingQty = coercePositiveInt(ex.quantity, 0);
      const reviveQty = existingQty > 0 ? existingQty : requestedQty;

      const { data: revived, error: reviveErr } = await supabaseServer
        .from("shopping_list_items")
        .update({
          dismissed: false,
          checked: false,
          quantity: reviveQty,
          name: nameRaw,
        })
        .eq("id", ex.id)
        .select(
          "id,user_id,name,normalized_name,source_type,source_recipe_id,checked,dismissed,quantity"
        )
        .single();

      if (reviveErr) {
        return NextResponse.json({ error: reviveErr.message }, { status: 500 });
      }

      return NextResponse.json(
        { item: revived, note: "Revived existing item" },
        { status: 200 }
      );
    }

    // ✅ Always insert; never "conflict"
    const payload = {
      user_id: null, // single-user mode
      name: nameRaw,
      normalized_name: normalized,
      source_recipe_id: null,
      checked: false,
      dismissed: false,
      quantity: requestedQty,
    };

    // Try manual; fallback to derived if constrained
    let inserted: any = null;

    const first = await tryInsertWithSourceType(payload, "manual");
    if (!first.error) {
      inserted = first.data;
    } else {
      const msg = String(first.error.message || "");
      if (
        msg.includes("source_type") &&
        msg.includes("violates check constraint")
      ) {
        const second = await tryInsertWithSourceType(payload, "derived");
        if (second.error) {
          return NextResponse.json(
            { error: second.error.message },
            { status: 500 }
          );
        }
        inserted = second.data;
      } else {
        return NextResponse.json({ error: first.error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ item: inserted }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
