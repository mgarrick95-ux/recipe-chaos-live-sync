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

async function tryInsertWithSourceType(payload: any, source_type: string) {
  const { data, error } = await supabaseServer
    .from("shopping_list_items")
    .insert([{ ...payload, source_type }])
    .select("id,user_id,name,normalized_name,source_type,source_recipe_id,checked,dismissed")
    .single();

  return { data, error };
}

export async function GET() {
  const { data, error } = await supabaseServer
    .from("shopping_list_items")
    .select("id,user_id,name,normalized_name,source_type,source_recipe_id,checked,dismissed")
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

    // De-dupe: don’t add if normalized_name already exists.
    // If it exists but is dismissed, we "revive" it.
    const { data: existing, error: existingErr } = await supabaseServer
      .from("shopping_list_items")
      .select("id,dismissed")
      .eq("normalized_name", normalized)
      .limit(1);

    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }

    if (existing && existing.length > 0) {
      const ex = existing[0] as any;
      if (ex.dismissed === true) {
        const { data: revived, error: reviveErr } = await supabaseServer
          .from("shopping_list_items")
          .update({ dismissed: false, checked: false, name: nameRaw })
          .eq("id", ex.id)
          .select("id,user_id,name,normalized_name,source_type,source_recipe_id,checked,dismissed")
          .single();

        if (reviveErr) {
          return NextResponse.json({ error: reviveErr.message }, { status: 500 });
        }
        return NextResponse.json({ item: revived }, { status: 200 });
      }

      return NextResponse.json({ note: "Item already exists", item: null }, { status: 200 });
    }

    const payload = {
      user_id: null, // single-user mode
      name: nameRaw,
      normalized_name: normalized,
      source_recipe_id: null,
      checked: false,
      dismissed: false,
    };

    // Try "manual" first. If your DB only allows "derived", fallback to "derived".
    let inserted: any = null;

    const first = await tryInsertWithSourceType(payload, "manual");
    if (!first.error) {
      inserted = first.data;
    } else {
      const msg = String(first.error.message || "");
      if (msg.includes("source_type") && msg.includes("violates check constraint")) {
        const second = await tryInsertWithSourceType(payload, "derived");
        if (second.error) {
          return NextResponse.json({ error: second.error.message }, { status: 500 });
        }
        inserted = second.data;
      } else {
        return NextResponse.json({ error: first.error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ item: inserted }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
