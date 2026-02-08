// lib/plannedUsage.ts

type Recipe = {
  id: string;
  ingredients?: string[] | null;
};

type Slot = {
  recipeId: string | null;
  sideRecipeId: string | null;
  cooked?: boolean;
};

function normalizeName(input: string) {
  return input
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * v1 rule:
 * - Each recipe appearance = 1 unit per ingredient (presence-based)
 */
export function computePlannedUsage(
  slots: Slot[],
  recipesById: Map<string, Recipe>
) {
  const usage: Record<string, number> = {};

  for (const slot of slots) {
    if (!slot.recipeId) continue;

    const main = recipesById.get(slot.recipeId);
    const side = slot.sideRecipeId
      ? recipesById.get(slot.sideRecipeId)
      : null;

    const allIngredients = [
      ...(main?.ingredients ?? []),
      ...(side?.ingredients ?? []),
    ];

    for (const raw of allIngredients) {
      const key = normalizeName(raw);
      if (!key) continue;
      usage[key] = (usage[key] ?? 0) + 1;
    }
  }

  return usage;
}
