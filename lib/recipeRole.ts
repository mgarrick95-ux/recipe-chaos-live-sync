// lib/recipeRole.ts

export type RecipeRole =
  | "main"
  | "side"
  | "dessert"
  | "snack"
  | "breakfast"
  | "utility";

type RecipeLike = {
  title?: string | null;
  tags?: string[] | null;
  ingredients?: string[] | null;
};

function hasTag(recipe: RecipeLike, tag: string) {
  return (recipe.tags ?? []).map(t => t.toLowerCase()).includes(tag.toLowerCase());
}

export function classifyRecipeRole(recipe: RecipeLike): RecipeRole {
  const title = (recipe.title ?? "").toLowerCase();
  const ingredientCount = recipe.ingredients?.length ?? 0;

  // 1️⃣ Explicit tags win
  if (hasTag(recipe, "side")) return "side";
  if (hasTag(recipe, "dessert")) return "dessert";
  if (hasTag(recipe, "snack")) return "snack";
  if (hasTag(recipe, "breakfast")) return "breakfast";
  if (hasTag(recipe, "utility")) return "utility";

  // 2️⃣ Title heuristics
  if (/(cookie|cookies|brownie|cake|pie)/.test(title)) return "dessert";
  if (/(fries|chips|bread|rolls?|toast)/.test(title)) return "side";

  // 3️⃣ Ingredient count heuristic
  if (ingredientCount > 0 && ingredientCount <= 3) return "side";

  // 4️⃣ Default
  return "main";
}
