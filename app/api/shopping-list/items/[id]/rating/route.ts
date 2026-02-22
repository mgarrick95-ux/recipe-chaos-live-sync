// app/api/recipes/[id]/rating/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const id = params.id;
    const body = await req.json().catch(() => ({}));

    const ratingRaw = body?.rating;

    let rating: number | null = null;
    if (ratingRaw === null || ratingRaw === undefined || ratingRaw === "") {
      rating = null;
    } else {
      const n = Number(ratingRaw);
      if (!Number.isFinite(n)) {
        return NextResponse.json({ ok: false, error: "rating must be 1–5 or null" }, { status: 400 });
      }
      const v = Math.floor(n);
      if (v < 1 || v > 5) {
        return NextResponse.json({ ok: false, error: "rating must be 1–5 or null" }, { status: 400 });
      }
      rating = v;
    }

    const { data, error } = await supabaseAdmin
      .from("recipes")
      .update({
        rating,
        rating_updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id,rating,rating_updated_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, recipe: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
