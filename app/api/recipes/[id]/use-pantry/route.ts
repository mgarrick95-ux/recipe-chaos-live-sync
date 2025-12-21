// app/api/recipes/[id]/use-pantry/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type Params = { params: { id: string } };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(_req: Request, { params }: Params) {
  const { id } = params;

  try {
    const supabase = supabaseServer;

    // 1) Load the recipe (we only need ingredients)
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id, title, ingredients")
      .eq("id", id)
      .single();

    if (recipeError) throw recipeError;
    if (!recipe) throw new Error("Recipe not found");

    const rawIngredients = (recipe.ingredients ?? "") as string;

    const ingredientLines = rawIngredients
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (ingredientLines.length === 0) {
      return NextResponse.json({
        ok: true,
        updates: [],
        summary: "No ingredients saved on this recipe yet.",
      });
    }

    // 2) Load current FrostPantry items
    const { data: storageItems, error: storageError } = await supabase
      .from("storage_items")
      .select("id, name, quantity, unit, location")
      .gt("quantity", 0);

    if (storageError) throw storageError;

    if (!storageItems || storageItems.length === 0) {
      return NextResponse.json({
        ok: true,
        updates: [],
        summary: "FrostPantry is empty – nothing to update.",
      });
    }

    const normalizedPantry = storageItems.map((item) => ({
      ...item,
      normName: normalize(item.name ?? ""),
    }));

    type Update = {
      id: string;
      name: string;
      oldQuantity: number;
      newQuantity: number;
    };

    const updates: Update[] = [];

    // 3) For each ingredient line, find the first matching pantry item and decrement by 1
    for (const line of ingredientLines) {
      const normLine = normalize(line);
      if (!normLine) continue;

      const words = normLine.split(" ");
      const key =
        words.length >= 2 ? `${words[0]} ${words[1]}` : words[0];

      if (!key || key.length < 3) continue;

      const match = normalizedPantry.find((p) => p.normName.includes(key));
      if (!match) continue;

      const oldQty = match.quantity ?? 0;
      if (oldQty <= 0) continue;

      const newQty = Math.max(0, oldQty - 1);

      const { error: updateError } = await supabase
        .from("storage_items")
        .update({ quantity: newQty })
        .eq("id", match.id);

      if (updateError) throw updateError;

      updates.push({
        id: match.id,
        name: match.name,
        oldQuantity: oldQty,
        newQuantity: newQty,
      });

      match.quantity = newQty;
    }

    const summary =
      updates.length === 0
        ? "No matching FrostPantry items were found for these ingredients."
        : `Updated ${updates.length} FrostPantry item${
            updates.length === 1 ? "" : "s"
          }.`;

    return NextResponse.json({
      ok: true,
      updates,
      summary,
    });
  } catch (err: any) {
    console.error("POST /api/recipes/[id]/use-pantry error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Failed to update FrostPantry from recipe",
      },
      { status: 500 }
    );
  }
}
