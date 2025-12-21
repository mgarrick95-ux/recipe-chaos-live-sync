import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const { id } = params;

  try {
    const supabase = supabaseServer;

    const { data, error } = await supabase
      .from("storage_items")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, item: data });
  } catch (err: any) {
    console.error("GET /api/storage-items/[id] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to load storage item" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = params;

  try {
    const body = await request.json();
    const supabase = supabaseServer;

    const updatePayload = {
      name: body.name ?? undefined,
      location: body.location ?? undefined,
      quantity: body.quantity ?? undefined,
      unit: body.unit ?? undefined,
      category: body.category ?? undefined,
      is_leftover: body.is_leftover ?? undefined,
      use_by: body.use_by ?? undefined,
      notes: body.notes ?? undefined,
      updated_at: new Date().toISOString(),
    };

    // Remove undefined fields so we don't accidentally wipe columns
    Object.keys(updatePayload).forEach((k) => {
      // @ts-ignore
      if (updatePayload[k] === undefined) delete updatePayload[k];
    });

    const { data, error } = await supabase
      .from("storage_items")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, item: data });
  } catch (err: any) {
    console.error("PATCH /api/storage-items/[id] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to update storage item" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = params;

  try {
    const supabase = supabaseServer;

    const { error } = await supabase.from("storage_items").delete().eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/storage-items/[id] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to delete storage item" },
      { status: 500 }
    );
  }
}
