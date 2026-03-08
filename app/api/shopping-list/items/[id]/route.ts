import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizeShoppingListIdentifier } from "@/lib/shopping/normalize";

export const dynamic = "force-dynamic";

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

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const supabase = supabaseServer;

  const id = String(ctx?.params?.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: any = {};

  if (typeof body?.checked === "boolean") update.checked = body.checked;
  if (typeof body?.dismissed === "boolean") update.dismissed = body.dismissed;
  if (body?.quantity !== undefined) update.quantity = coerceQuantityToText(body.quantity);

  if (typeof body?.name === "string") {
    const nextNameRaw = body.name.trim();

    if (!nextNameRaw) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    const ident = normalizeShoppingListIdentifier(nextNameRaw);
    if (!ident.displayName || !ident.normalizedName) {
      return NextResponse.json(
        { error: "Please enter a product name." },
        { status: 400 }
      );
    }

    update.name = ident.displayName;
    update.normalized_name = ident.normalizedName;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("shopping_list_items")
    .update(update)
    .eq("id", id)
    .eq("user_id", DEFAULT_USER_ID)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const supabase = supabaseServer;

  const id = String(ctx?.params?.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("id", id)
    .eq("user_id", DEFAULT_USER_ID);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}