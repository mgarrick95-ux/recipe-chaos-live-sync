import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { normalizeShoppingListIdentifier } from "@/lib/shopping/normalize";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const { id } = params;

  try {
    const supabase = supabaseServer;

    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id, title, ingredients")
      .eq("id", id)
      .single();

    if (recipeError) throw recipeError;

    const ingredients: string[] = Array.isArray(recipe.ingredients)
      ? recipe.ingredients
      : String(recipe.ingredients || "")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

    const { data: pantry, error: pantryError } = await supabase
      .from("storage_items")
      .select("id, name, quantity")
      .gt("quantity", 0);

    if (pantryError) throw pantryError;

    const normalizedPantry = (pantry ?? []).map((p) => ({
      ...p,
      norm: normalizeShoppingListIdentifier(p.name).normalizedName,
    }));

    const matched: any[] = [];
    const partial: any[] = [];
    const missing: any[] = [];

    for (const raw of ingredients) {
      const simplified = raw
        .toLowerCase()
        .replace(/[0-9\/\.\-]+/g, "")
        .replace(/\b(cup|cups|teaspoon|teaspoons|tablespoon|tablespoons|tbsp|tsp|oz|ounce|ounces|pound|pounds|lb|lbs|gram|grams|g)\b/g, "")
        .replace(/\b(of|and|or|to|for|with|at|room|temperature)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();

      const ident = normalizeShoppingListIdentifier(simplified || raw);
      if (!ident.normalizedName) continue;

      const match = normalizedPantry.find((p) =>
        p.norm.includes(ident.normalizedName)
      );

      if (!match) {
        missing.push({ ingredient: raw });
        continue;
      }

      const isExact =
        match.norm === ident.normalizedName ||
        ident.normalizedName.includes(match.norm);

      if (isExact && (match.quantity ?? 0) > 0) {
        matched.push({
          ingredient: raw,
          pantryItem: match.name,
          quantityAvailable: match.quantity,
        });
      } else {
        partial.push({
          ingredient: raw,
          pantryItem: match.name,
          quantityAvailable: match.quantity,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      matched,
      partial,
      missing,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Pantry match failed",
      },
      { status: 500 }
    );
  }
}


