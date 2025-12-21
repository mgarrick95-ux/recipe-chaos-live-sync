// lib/shoppingListDerive.ts
export function normalizeName(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "");
}

type IngredientLike =
  | string
  | { name?: string; item?: string; text?: string; ingredient?: string };

export function extractIngredientNamesFromAny(value: unknown): string[] {
  // Handles:
  // - string "milk, eggs"
  // - string[] ["milk", "eggs"]
  // - { name } objects
  // - array of objects
  if (!value) return [];

  // string
  if (typeof value === "string") {
    return value
      .split(/[\n,]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // array
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const v of value) {
      if (typeof v === "string") {
        const s = v.trim();
        if (s) out.push(s);
      } else if (v && typeof v === "object") {
        const obj = v as IngredientLike as any;
        const s =
          (obj.name ?? obj.item ?? obj.text ?? obj.ingredient ?? "")
            .toString()
            .trim();
        if (s) out.push(s);
      }
    }
    return out;
  }

  // object
  if (typeof value === "object") {
    const obj: any = value;
    const maybeArray =
      obj.ingredients ??
      obj.items ??
      obj.ingredient_list ??
      obj.ingredientList ??
      obj.data;

    if (maybeArray) return extractIngredientNamesFromAny(maybeArray);

    return [];
  }

  return [];
}
