import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type Params = { params: { id: string } };

type UsePantryBody = {
  storageItemId?: string;
  ingredient?: string;
  quantityUsed?: number | null;
};

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function toIngredientLines(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : String(v)))
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return normalizeNewlines(value)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [String(value)].map((s) => s.trim()).filter(Boolean);
}

function parseQuantityUsed(value: unknown): number {
  if (value == null || value === "") return 1;

  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("quantityUsed must be a positive number");
  }

  return n;
}

export async function POST(req: Request, { params }: Params) {
  const { id: recipeId } = params;

  try {
    const body = (await req.json()) as UsePantryBody;

    const storageItemId = String(body.storageItemId ?? "").trim();
    const ingredient = String(body.ingredient ?? "").trim();
    const quantityUsed = parseQuantityUsed(body.quantityUsed);

    if (!storageItemId) {
      return NextResponse.json(
        { ok: false, error: "storageItemId is required" },
        { status: 400 }
      );
    }

    if (!ingredient) {
      return NextResponse.json(
        { ok: false, error: "ingredient is required" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer;

    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id, title, ingredients")
      .eq("id", recipeId)
      .single();

    if (recipeError) throw recipeError;

    if (!recipe) {
      return NextResponse.json(
        { ok: false, error: "Recipe not found" },
        { status: 404 }
      );
    }

    const recipeIngredients = toIngredientLines(recipe.ingredients);
    const recipeHasIngredient = recipeIngredients.includes(ingredient);

    if (!recipeHasIngredient) {
      return NextResponse.json(
        {
          ok: false,
          error: "That ingredient does not belong to this recipe.",
        },
        { status: 400 }
      );
    }

    const { data: storageItem, error: storageError } = await supabase
      .from("storage_items")
      .select("id, name, quantity, unit, location")
      .eq("id", storageItemId)
      .single();

    if (storageError) throw storageError;

    if (!storageItem) {
      return NextResponse.json(
        { ok: false, error: "Storage item not found" },
        { status: 404 }
      );
    }

    const currentQuantity = Number(storageItem.quantity ?? 0);

    if (!Number.isFinite(currentQuantity)) {
      return NextResponse.json(
        { ok: false, error: "Storage item quantity is invalid" },
        { status: 400 }
      );
    }

    if (currentQuantity <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `${storageItem.name ?? "That item"} is already at 0.`,
        },
        { status: 400 }
      );
    }

    if (quantityUsed > currentQuantity) {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot use ${quantityUsed} when only ${currentQuantity} is available.`,
        },
        { status: 400 }
      );
    }

    const newQuantity = currentQuantity - quantityUsed;

    const { data: updatedRows, error: updateError } = await supabase
      .from("storage_items")
      .update({ quantity: newQuantity })
      .eq("id", storageItemId)
      .select("id, name, quantity, unit, location");

    if (updateError) throw updateError;

    const updatedItem = Array.isArray(updatedRows) ? updatedRows[0] : null;

    return NextResponse.json({
      ok: true,
      recipeId,
      ingredient,
      storageItemId,
      quantityUsed,
      update: {
        id: storageItem.id,
        name: storageItem.name ?? null,
        oldQuantity: currentQuantity,
        newQuantity,
        unit: storageItem.unit ?? null,
        location: storageItem.location ?? null,
      },
      storageItem: updatedItem ?? {
        id: storageItem.id,
        name: storageItem.name ?? null,
        quantity: newQuantity,
        unit: storageItem.unit ?? null,
        location: storageItem.location ?? null,
      },
      summary:
        newQuantity === 0
          ? `Used ${quantityUsed} from ${storageItem.name ?? "storage item"}. It is now out of stock.`
          : `Used ${quantityUsed} from ${storageItem.name ?? "storage item"}.`,
    });
  } catch (err: any) {
    console.error("POST /api/recipes/[id]/use-pantry error:", err);

    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Failed to use pantry item",
      },
      { status: 500 }
    );
  }
}
