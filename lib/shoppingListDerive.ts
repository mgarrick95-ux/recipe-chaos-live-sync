// lib/shoppingListDerive.ts
import { normalizeName } from "@/lib/shopping/normalize";

type IngredientLike =
  | string
  | { name?: string; item?: string; text?: string; ingredient?: string };

/**
 * Split ingredient text safely.
 *
 * Old behavior (bad): split on commas always → truncates product names:
 *   "Everything But The Bagel Seasoning, to taste" → "Everything But The Bagel Seasoning" + "to taste"
 *   (sometimes even worse fragments depending on upstream formatting)
 *
 * New behavior (safer):
 * - Always split on newlines.
 * - Only split on commas when it clearly looks like a short 2-item list (e.g., "milk, eggs").
 * - Otherwise, keep commas inside the same ingredient line.
 */
function splitIngredientText(input: string): string[] {
  const raw = String(input ?? "").trim();
  if (!raw) return [];

  // 1) Split on newlines (safe)
  const lines = raw
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean);

  // If multiple lines, don't comma-split further — recipes often use commas for notes.
  if (lines.length > 1) return lines;

  const one = lines[0] ?? raw;
  if (!one.includes(",")) return [one];

  // 2) Comma heuristic:
  // Split only when it looks like "milk, eggs" (two short parts)
  const parts = one
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // If there are many commas, it's more likely a list; but we still protect long product names.
  // We'll only split if ALL parts are short.
  const wordCounts = parts.map((p) => p.split(/\s+/).filter(Boolean).length);

  const allShort = wordCounts.every((n) => n <= 2);
  if (allShort) return parts;

  // Otherwise keep intact (prevents "everything but the" fragments)
  return [one];
}

export function extractIngredientNamesFromAny(value: unknown): string[] {
  // Handles:
  // - string
  // - string[]
  // - object with { name/item/text/ingredient }
  // - array of objects
  // - nested object holding ingredients arrays

  if (!value) return [];

  // string
  if (typeof value === "string") {
    return splitIngredientText(value);
  }

  // array
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const v of value) {
      if (typeof v === "string") {
        out.push(...splitIngredientText(v));
      } else if (v && typeof v === "object") {
        const obj = v as IngredientLike as any;
        const s =
          (obj.name ?? obj.item ?? obj.text ?? obj.ingredient ?? "")
            .toString()
            .trim();
        if (s) out.push(...splitIngredientText(s));
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

// Re-export for any legacy imports that still import normalizeName from this file
export { normalizeName };


