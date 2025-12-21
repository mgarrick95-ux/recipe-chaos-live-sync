import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabaseServer
    .from("recipes")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...data,
    instructions: data.steps ?? [],
    serves: data.servings ?? null,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.json();

  const updates = {
    title: body.title,
    description: body.description,
    short_description: body.short_description,
    tags: body.tags,
    favorite: body.favorite,
    servings: body.serves,
    prep_minutes: body.prep_minutes,
    cook_minutes: body.cook_minutes,
    ingredients: body.ingredients,
    steps: body.instructions,
    notes: body.notes,
  };

  const { error } = await supabaseServer
    .from("recipes")
    .update(updates)
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await supabaseServer
    .from("recipes")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
