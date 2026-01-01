// lib/recipeEnhance.ts

export type EnhanceInput = {
  title?: string | null;
  description?: string | null;
  ingredients?: unknown;
  instructions?: unknown;
  sourceText?: string | null;
};

function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? v : String(v))).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") return value.split("\n").map((s) => s.trim()).filter(Boolean);
  return [String(value)].map((s) => s.trim()).filter(Boolean);
}

function blobify(input: EnhanceInput): string {
  const parts = [
    input.title ?? "",
    input.description ?? "",
    toStringArray(input.ingredients).join(" "),
    toStringArray(input.instructions).join(" "),
    input.sourceText ?? "",
  ];
  return parts.join(" ").toLowerCase();
}

function hasAny(blob: string, words: string[]): boolean {
  return words.some((w) => blob.includes(w));
}

export function autoTags(input: EnhanceInput): string[] {
  const blob = blobify(input);

  const tags: string[] = [];

  // Meal type
  if (hasAny(blob, ["breakfast", "pancake", "waffle", "omelet", "eggs", "granola", "oatmeal"])) tags.push("Breakfast");
  if (hasAny(blob, ["lunch", "sandwich", "wrap", "salad"])) tags.push("Lunch");
  if (hasAny(blob, ["dinner", "roast", "casserole", "skillet", "stew"])) tags.push("Dinner");
  if (hasAny(blob, ["dessert", "cookie", "brownie", "cake", "muffin", "pie", "frosting"])) tags.push("Dessert");
  if (hasAny(blob, ["snack", "dip", "chips", "bites"])) tags.push("Snack");

  // Cooking method
  if (hasAny(blob, ["air fry", "air-fry", "airfryer", "air fryer"])) tags.push("Air Fryer");
  if (hasAny(blob, ["slow cooker", "crock pot", "crockpot"])) tags.push("Slow Cooker");
  if (hasAny(blob, ["instant pot", "pressure cook"])) tags.push("Instant Pot");
  if (hasAny(blob, ["oven", "bake", "baked", "roast"])) tags.push("Oven");
  if (hasAny(blob, ["grill", "grilled"])) tags.push("Grill");
  if (hasAny(blob, ["stovetop", "skillet", "pan", "saute", "sauté"])) tags.push("Stovetop");

  // Dietary-ish (light touch, not medical)
  if (hasAny(blob, ["gluten-free", "gluten free"])) tags.push("Gluten-Free");
  if (hasAny(blob, ["dairy-free", "dairy free"])) tags.push("Dairy-Free");

  // Your vibe tags (useful later)
  if (hasAny(blob, ["15 minute", "20 minute", "30 minute", "quick", "easy"])) tags.push("Easy");
  if (hasAny(blob, ["meal prep", "freezer", "batch"])) tags.push("Meal Prep");

  // Dedupe
  return Array.from(new Set(tags));
}

export function detectServings(input: EnhanceInput): number | null {
  const text = blobify(input);

  // Common patterns:
  // "Serves 4" / "Servings: 6" / "Yield: 8 pancakes" / "Makes 12"
  const patterns: RegExp[] = [
    /serves\s+(\d{1,2})\b/i,
    /servings?\s*[:\-]\s*(\d{1,2})\b/i,
    /servings?\s+(\d{1,2})\b/i,
    /yield\s*[:\-]\s*(\d{1,2})\b/i,
    /makes\s+(\d{1,2})\b/i,
  ];

  for (const rx of patterns) {
    const m = text.match(rx);
    if (m?.[1]) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 24) return n;
    }
  }

  return null;
}

export function enhanceRecipe(input: EnhanceInput): { tags: string[]; serves: number | null } {
  return {
    tags: autoTags(input),
    serves: detectServings(input),
  };
}
