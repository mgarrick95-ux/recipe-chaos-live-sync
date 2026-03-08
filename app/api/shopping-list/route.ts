import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_USER_ID = "125bc9a1-dd04-4a23-8675-6346dca77c87";

export async function GET() {
  const supabase = supabaseServer;

  const { data, error } = await supabase
    .from("shopping_list_items")
    .select("*")
    .eq("user_id", DEFAULT_USER_ID)
    .eq("dismissed", false)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, items: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}