import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  buildStorageIndex,
  summarizeIngredients,
  toStringArray,
  type StorageItem,
} from "@/lib/ingredientMatch";

type Params = { params: { id: string } };

type PantryMatchRow = {
  ingredient: string;
  pantryItem?: string | null;
  matchedStorageRawName?: string | null;
  quantityAvailable?: number | null;
  matchKind?: string | null;
  isSoftMatch?: boolean;
};

function parseIngredients(value: unknown): string[] {
  if (Array.isArray(value)) {
    return toStringArray(value);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return toStringArray(value);
}

function makeQuantityLookup(items: StorageItem[]) {
  const map = new Map<string, number>();

  for (const item of items) {
    const name = String(item.name ?? item.item_name ?? item.title ?? "").trim();
    if (!name) continue;

    const qty = Number(item.quantity ?? item.qty ?? item.count ?? 0);
    const safeQty = Number.isFinite(qty) ? qty : 0;

    map.set(name.toLowerCase(), (map.get(name.toLowerCase()) ?? 0) + safeQty);
  }

  return map;
}

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

    const ingredients = parseIngredients(recipe?.ingredients);

    const { data: pantry, error: pantryError } = await supabase
      .from("storage_items")
      .select("id, name, quantity, unit, location")
      .gt("quantity", 0);

    if (pantryError) throw pantryError;

    const storageItems: StorageItem[] = pantry ?? [];
    const storageIndex = buildStorageIndex(storageItems);
    const quantityByName = makeQuantityLookup(storageItems);
    const summary = summarizeIngredients(ingredients, storageIndex);

    const matched: PantryMatchRow[] = [];
    const partial: PantryMatchRow[] = [];
    const missing: PantryMatchRow[] = [];

    for (const detail of summary.details) {
      if (!detail.matched) {
        missing.push({
          ingredient: detail.ingredient,
          pantryItem: null,
          matchedStorageRawName: null,
          quantityAvailable: null,
          matchKind: null,
          isSoftMatch: false,
        });
        continue;
      }

      const pantryItem = detail.matchedStorageRawName;
      const quantityAvailable = pantryItem
        ? quantityByName.get(pantryItem.toLowerCase()) ?? null
        : null;

      const row: PantryMatchRow = {
        ingredient: detail.ingredient,
        pantryItem,
        matchedStorageRawName: pantryItem,
        quantityAvailable,
        matchKind: detail.matchKind,
        isSoftMatch: detail.isSoftMatch,
      };

      if (detail.isSoftMatch) {
        partial.push(row);
      } else {
        matched.push(row);
      }
    }

    return NextResponse.json({
      ok: true,
      matched,
      partial,
      missing,
      summary: {
        total: summary.total,
        haveCount: summary.haveCount,
        softHaveCount: summary.softHaveCount,
        missingCount: summary.missing.length,
        allInStock: summary.allInStock,
      },
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
