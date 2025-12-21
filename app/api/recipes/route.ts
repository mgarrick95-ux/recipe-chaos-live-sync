import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();

  const insert = {
    title: body.title,
    description: body.description ?? null,
    short_description: body.short_description ?? null,
    tags: body.tags ?? [],
    favorite: body.favorite ?? false,
    servings: body.serves ?? null,
    prep_minutes: body.prep_minutes ?? null,
    cook_minutes: body.cook_minutes ?? null,
    ingredients: body.ingredients ?? [],
    steps: body.instructions ?? [],
    notes: body.notes ?? null,
  };

  const { data, error } = await supabaseServer
    .from("recipes")
    .insert(insert)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
