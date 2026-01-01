import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const id = params.id;
    const body = await req.json().catch(() => ({}));

    const update: Record<string, any> = {};

    if (typeof body?.checked === "boolean") update.checked = body.checked;
    if (typeof body?.dismissed === "boolean") update.dismissed = body.dismissed;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true });
    }

    const { data, error } = await supabaseAdmin
      .from("shopping_list_items")
      .update(update)
      .eq("id", id)
      .select("id,user_id,name,normalized_name,source_type,source_recipe_id,checked,dismissed")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await supabaseAdmin.from("shopping_list_items").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
