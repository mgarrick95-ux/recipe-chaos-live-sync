// app/api/shopping-list/route.ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Compatibility alias.
 * Prefer using /api/shopping-list/items for all real app behavior.
 */
export async function GET(req: Request) {
  const supabase = createSupabaseServerClient(req);
  const { data: auth, error: authErr } = await supabase.auth.getUser();

  if (authErr || !auth?.user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("shopping_list_items")
    .select("*")
    .eq("user_id", auth.user.id)
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