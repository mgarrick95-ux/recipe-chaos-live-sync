// app/api/shopping-list/manual/route.ts
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();

    if (!name) {
      return NextResponse.json({ ok: false, error: "Name is required." }, { status: 400 });
    }

    // Prevent duplicates by normalized_name
    const normalized = normalizeName(name);
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("shopping_list_items")
      .select("id")
      .eq("normalized_name", normalized)
      .maybeSingle();

    if (existErr) {
      return NextResponse.json({ ok: false, error: existErr.message }, { status: 500 });
    }

    if (!existing) {
      const { error: insErr } = await supabaseAdmin.from("shopping_list_items").insert({
        name,
        normalized_name: normalized,
        source_type: "manual",
        checked: false,
      });

      if (insErr) {
        return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
