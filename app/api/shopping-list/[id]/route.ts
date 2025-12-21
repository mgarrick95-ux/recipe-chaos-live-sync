// app/api/shopping-list/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeName(input: string) {
  return (input ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "");
}

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const id = params.id;
    const body = await req.json();

    const update: Record<string, any> = {};

    if (typeof body?.checked === "boolean") update.checked = body.checked;

    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ ok: false, error: "Name cannot be empty." }, { status: 400 });
      }
      update.name = name;
      update.normalized_name = normalizeName(name);
    }

    if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

    const { error } = await supabaseAdmin.from("shopping_list_items").update(update).eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
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
