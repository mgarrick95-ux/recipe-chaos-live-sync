// lib/recipeNormalize.ts

export function normalizeStringArray(input: any): string[] {
  if (!input) return [];

  // Supabase may return Postgres arrays, JSON arrays, etc.
  if (Array.isArray(input)) {
    return input
      .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (typeof input === "string") {
    // Support CSV-ish tags OR multiline ingredients/instructions
    // We'll decide split behavior at call sites when needed.
    return [input];
  }

  // fallback: number/object/etc
  return [String(input)].map((s) => s.trim()).filter(Boolean);
}

export function normalizeTags(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((t) => String(t).trim()).filter(Boolean);
  if (typeof input === "string") {
    return input
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [String(input)].map((t) => t.trim()).filter(Boolean);
}

export function normalizeMultiline(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  return [String(input)].map((l) => l.trim()).filter(Boolean);
}

export function toTextareaValue(input: any): string {
  if (!input) return "";
  if (Array.isArray(input)) return input.map((x) => String(x)).join("\n");
  if (typeof input === "string") return input;
  return String(input);
}

// strips "1 lb", "2 cups", "½", etc. to get a matchable base ingredient name
export function ingredientBaseName(line: string): string {
  if (!line) return "";
  let s = line.toLowerCase();

  // remove anything in parentheses
  s = s.replace(/\([^)]*\)/g, " ");

  // remove leading quantities/fractions
  s = s.replace(/^\s*[\d\/\.\-¼½¾⅓⅔⅛⅜⅝⅞]+\s*/g, "");

  // remove common units at the start
  s = s.replace(
    /^\s*(tsp|tbsp|teaspoon|tablespoon|cup|cups|oz|ounce|ounces|lb|lbs|pound|pounds|g|kg|ml|l|liter|litre|pinch|dash|clove|cloves|slice|slices)\b\s*/g,
    ""
  );

  // remove commas and extra spaces
  s = s.replace(/[,\u2013\u2014]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

export function normalizeNameForMatch(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
