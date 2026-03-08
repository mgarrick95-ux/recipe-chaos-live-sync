import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizeShoppingListIdentifier } from "@/lib/shopping/normalize";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_USER_ID = "125bc9a1-dd04-4a23-8675-6346dca77c87";

function coerceQuantityToText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.max(1, Math.floor(value)));
  }

  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n)) {
      return String(Math.max(1, Math.floor(n)));
    }
  }

  return "1";
}

export async function GET() {
  const supabase = supabaseServer;

  const { data, error: dbErr } = await supabase
    .from("shopping_list_items")
    .select("*")
    .eq("user_id", DEFAULT_USER_ID)
    .eq("dismissed", false)
    .order("created_at", { ascending: false });

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { items: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const supabase = supabaseServer;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const nameRaw = String(body?.name || "").trim();
  if (!nameRaw) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const ident = normalizeShoppingListIdentifier(nameRaw);
  if (!ident.displayName || !ident.normalizedName) {
    return NextResponse.json({ error: "Please enter a product name." }, { status: 400 });
  }

  const quantityText = coerceQuantityToText(body?.quantity);

  const { data: existingRows, error: findErr } = await supabase
    .from("shopping_list_items")
    .select("*")
    .eq("user_id", DEFAULT_USER_ID)
    .eq("normalized_name", ident.normalizedName)
    .eq("is_derived", false)
    .order("created_at", { ascending: false })
    .limit(1);

  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }

  const existing =
    Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;

  if (existing) {
    const { data, error: updateErr } = await supabase
      .from("shopping_list_items")
      .update({
        name: ident.displayName,
        normalized_name: ident.normalizedName,
        quantity: quantityText,
        checked: false,
        dismissed: false,
        source_type: "manual",
        source_recipe_id: null,
        is_derived: false,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json(
      { item: data },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const { data, error: insertErr } = await supabase
    .from("shopping_list_items")
    .insert({
      user_id: DEFAULT_USER_ID,
      name: ident.displayName,
      normalized_name: ident.normalizedName,
      quantity: quantityText,
      unit: null,
      checked: false,
      dismissed: false,
      source_type: "manual",
      source_recipe_id: null,
      is_derived: false,
    })
    .select("*")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { item: data },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function PATCH(req: Request) {
  const supabase = supabaseServer;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.map((x: any) => String(x)).filter(Boolean)
    : [];

  const patch = body?.patch && typeof body.patch === "object" ? body.patch : null;

  if (!ids.length) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  }

  if (!patch) {
    return NextResponse.json({ error: "Missing patch" }, { status: 400 });
  }

  const update: any = {};

  if (typeof patch.checked === "boolean") update.checked = patch.checked;
  if (typeof patch.dismissed === "boolean") update.dismissed = patch.dismissed;
  if (patch.quantity !== undefined) update.quantity = coerceQuantityToText(patch.quantity);

  if (typeof patch.name === "string") {
    const nextNameRaw = patch.name.trim();

    if (!nextNameRaw) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    const ident = normalizeShoppingListIdentifier(nextNameRaw);
    if (!ident.displayName || !ident.normalizedName) {
      return NextResponse.json({ error: "Please enter a product name." }, { status: 400 });
    }

    update.name = ident.displayName;
    update.normalized_name = ident.normalizedName;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error: dbErr } = await supabase
    .from("shopping_list_items")
    .update(update)
    .in("id", ids)
    .eq("user_id", DEFAULT_USER_ID)
    .select("*");

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { items: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE(req: Request) {
  const supabase = supabaseServer;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.map((x: any) => String(x)).filter(Boolean)
    : [];

  if (!ids.length) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  }

  const { error: dbErr } = await supabase
    .from("shopping_list_items")
    .delete()
    .in("id", ids)
    .eq("user_id", DEFAULT_USER_ID);

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}