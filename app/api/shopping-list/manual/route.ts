// app/api/shopping-list/manual/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeShoppingListIdentity } from "@/lib/shopping/normalize";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawInput = String(body?.name ?? "").trim();

    if (!rawInput) {
      return NextResponse.json(
        { ok: false, error: "Name is required." },
        { status: 400 }
      );
    }

    // ✅ Use shared identity normalizer for BOTH display + key
    const ident = normalizeShoppingListIdentity(rawInput);
    const displayName = String(ident.displayName ?? "").trim();
    const normalized = String(ident.normalizedName ?? "").trim();

    if (!displayName || !normalized) {
      return NextResponse.json(
        { ok: false, error: "Name is invalid." },
        { status: 400 }
      );
    }

    // Prevent duplicates by normalized_name
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("shopping_list_items")
      .select("id,dismissed")
      .eq("normalized_name", normalized)
      .maybeSingle();

    if (existErr) {
      return NextResponse.json({ ok: false, error: existErr.message }, { status: 500 });
    }

    if (!existing) {
      const { error: insErr } = await supabaseAdmin
        .from("shopping_list_items")
        .insert({
          name: displayName,
          normalized_name: normalized,
          source_type: "manual",
          checked: false,
          dismissed: false,
        });

      if (insErr) {
        // If a race triggers unique, treat as ok.
        const msg = String(insErr.message || "").toLowerCase();
        const looksUnique = msg.includes("duplicate key") || msg.includes("unique");
        if (!looksUnique) {
          return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
        }
      }
    } else if (existing.dismissed === true) {
      // Revive dismissed item, update display name to the cleaned one
      const { error: updErr } = await supabaseAdmin
        .from("shopping_list_items")
        .update({ dismissed: false, checked: false, name: displayName })
        .eq("id", existing.id);

      if (updErr) {
        return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
      }
    } else {
      // Exists and active: quietly update name to cleaned display form (optional but helpful)
      // Keeps list tidy without changing identity.
      const { error: updErr } = await supabaseAdmin
        .from("shopping_list_items")
        .update({ name: displayName })
        .eq("id", existing.id);

      if (updErr) {
        return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
