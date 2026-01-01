import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type CommitRequest = {
  title: string;
  description?: string | null;
  source_url?: string | null;
  source_name?: string | null;
  ingredients?: string[] | null;
  instructions?: string[] | null;
};

function cleanLines(arr: any): string[] {
  if (!arr) return [];
  if (!Array.isArray(arr)) return [];
  return arr
    .map((v) => (typeof v === "string" ? v : String(v)))
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as CommitRequest | null;

    const title = (body?.title || "").trim();
    if (!title) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }

    const description =
      body?.description != null ? String(body.description).trim() : null;

    const source_url =
      body?.source_url != null ? String(body.source_url).trim() : null;

    const source_name =
      body?.source_name != null ? String(body.source_name).trim() : null;

    const ingredients = cleanLines(body?.ingredients);
    const instructions = cleanLines(body?.instructions);

    const { data, error } = await supabaseServer
      .from("recipes")
      .insert({
        title,
        description,
        source_url,
        source_name,
        ingredients: ingredients.length ? ingredients : null,
        instructions: instructions.length ? instructions : null,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      return NextResponse.json(
        { error: error?.message || "Insert failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
