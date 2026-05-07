import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  buildStorageIndex,
  summarizeIngredients,
  toStringArray,
  type StorageItem,
} from "@/lib/ingredientMatch";
import {
  canonicalKey,
  isDifferentProductByMarkers,
} from "@/lib/shopping/canonicalIngredients";
import { normalizeShoppingListIdentifier } from "@/lib/shopping/normalize";

type Params = { params: { id: string } };

type PantryMatchRow = {
  ingredient: string;
  pantryItem?: string | null;
  matchedStorageRawName?: string | null;
  quantityAvailable?: number | null;
  matchKind?: string | null;
  isSoftMatch?: boolean;
  inShoppingList?: boolean;
  shoppingListItemName?: string | null;
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

function findShoppingListMatch(
  ingredient: string,
  shoppingItems: { name?: string | null; checked?: boolean | null }[]
): string | null {
  const ingredientClean = normalizeShoppingListIdentifier(ingredient).displayName || ingredient;
  const ingredientCanon = canonicalKey(ingredientClean);
  if (!ingredientCanon) return null;

  for (const item of shoppingItems) {
    const name = String(item.name ?? "").trim();
    if (!name) continue;
    if (item.checked) continue;

    const nameClean = normalizeShoppingListIdentifier(name).displayName || name;

    if (isDifferentProductByMarkers(ingredientClean, nameClean)) continue;

    const itemCanon = canonicalKey(nameClean);
    if (!itemCanon) continue;

    if (itemCanon === ingredientCanon) {
      return name;
    }
  }

  return null;
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

    const { data: shoppingRows, error: shoppingError } = await supabase
      .from("shopping_list_items")
      .select("name, checked")
      .eq("dismissed", false);

    if (shoppingError) throw shoppingError;

    const shoppingItems = shoppingRows ?? [];

    const storageItems: StorageItem[] = pantry ?? [];
    const storageIndex = buildStorageIndex(storageItems);
    const quantityByName = makeQuantityLookup(storageItems);
    const summary = summarizeIngredients(ingredients, storageIndex);

    const matched: PantryMatchRow[] = [];
    const partial: PantryMatchRow[] = [];
    const missing: PantryMatchRow[] = [];

    for (const detail of summary.details) {
      const shoppingListItemName = findShoppingListMatch(detail.ingredient, shoppingItems);
      const inShoppingList = Boolean(shoppingListItemName);

      if (!detail.matched) {
        missing.push({
          ingredient: detail.ingredient,
          pantryItem: null,
          matchedStorageRawName: null,
          quantityAvailable: null,
          matchKind: null,
          isSoftMatch: false,
          inShoppingList,
          shoppingListItemName,
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
        inShoppingList,
        shoppingListItemName,
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


