import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const supabase = supabaseServer;

    const { data, error } = await supabase
      .from("storage_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (err: any) {
    console.error("GET /api/storage-items error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to load storage items" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const supabase = supabaseServer;

    // Keep this permissive; your UI can send extra fields without breaking.
    const payload = {
      name: body.name ?? null,
      location: body.location ?? null, // e.g. Freezer/Fridge/Pantry
      quantity: body.quantity ?? null,
      unit: body.unit ?? null, // e.g. bag, lb, box
      category: body.category ?? null,
      is_leftover: body.is_leftover ?? false,
      use_by: body.use_by ?? null, // ISO date string or null
      notes: body.notes ?? null,
    };

    const { data, error } = await supabase
      .from("storage_items")
      .insert(payload)
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
