import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const ROUTE_PATH = "/api/storage-items";

export async function GET() {
  try {
    const supabase = supabaseServer;

    const { data: items, error } = await supabase
      .from("storage_items")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          error: `500 ${ROUTE_PATH}: Failed to load storage items (${error.message}).`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, items: items ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: `500 ${ROUTE_PATH}: ${e?.message || "Unexpected error"}` },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = supabaseServer;

    const insertPayload = {
      name: body.name ?? null,
      location: body.location ?? "Pantry",
      quantity: body.quantity ?? 1,
      unit: body.unit ?? null,
      category: body.category ?? null,
      is_leftover: body.is_leftover ?? false,
      use_by: body.use_by ?? null,
      notes: body.notes ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("storage_items")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, item: data });
  } catch (err: any) {
    console.error("POST /api/storage-items error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to create storage item" },
      { status: 500 }
    );
  }
}
