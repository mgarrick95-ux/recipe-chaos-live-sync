// app/api/recipes/[id]/enhance/route.ts

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { enhanceRecipe } from "@/lib/recipeEnhance";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;

  // Load the recipe
  const { data: recipe, error } = await supabaseServer
    .from("recipes")
    .select("id,title,description,ingredients,instructions,steps,source_text,tags,serves,servings")
    .eq("id", id)
    .single();

  if (error || !recipe) {
    return NextResponse.json({ error: error?.message || "Recipe not found" }, { status: 404 });
  }

  const input = {
    title: recipe.title,
    description: recipe.description,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions ?? recipe.steps,
    sourceText: recipe.source_text,
  };

  const enhanced = enhanceRecipe(input);

  // Only update if we found anything useful
  const nextTags = enhanced.tags;
  const nextServes = enhanced.serves;

  const patch: Record<string, any> = {};

  if (nextTags.length > 0) patch.tags = nextTags;
  if (nextServes != null) patch.serves = nextServes;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, updated: false, tags: recipe.tags ?? [], serves: recipe.serves ?? recipe.servings ?? null });
  }

  const { data: updated, error: upErr } = await supabaseServer
    .from("recipes")
    .update(patch)
    .eq("id", id)
    .select("id,tags,serves")
    .single();

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: true, ...updated });
}
