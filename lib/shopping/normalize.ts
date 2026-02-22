// lib/shopping/normalize.ts

export type ShoppingIdent = {
  displayName: string; // product only
  normalizedName: string; // stable identity key
};

function normalizeSpaces(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function stripLeadingArticles(s: string) {
  return (s || "").replace(/^(a|an|the)\s+/i, "").trim();
}

function normalizeForKey(s: string) {
  return normalizeSpaces(
    (s || "")
      .toLowerCase()
      .replace(/[\u2019']/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
  );
}

/** If we end up with these, it's not a product. Drop it. */
const GARBAGE_BASES = new Set([
  "",
  "bbb",
  "jumbo",
  "everything",
  "everything but",
  "everything but the",
  "the",
  "and",
  "or",
]);

/** Phrases we want to strip if they appear at the end. */
const TAIL_PHRASES: RegExp[] = [
  /\bor\s+to\s+taste\s*$/i,
  /\bto\s+taste\s*$/i,
  /\bor\s+more\s*$/i,
  /\bor\s+to\s*$/i,
  /\bto\s*$/i,
  /\bor\s*$/i,
  /\bfor\s*$/i,
];

/** Prep words we never want as part of identity. */
const LEADING_PREP_WORDS = [
  "fresh",
  "freshly",
  "thinly",
  "finely",
  "roughly",
  "coarsely",
  "chopped",
  "diced",
  "minced",
  "sliced",
  "peeled",
  "rinsed",
  "drained",
  "melted",
  "softened",
  "optional",
];

/**
 * Measure/container words that should be stripped even WITHOUT a number.
 * This fixes: "pinch oregano" -> "oregano"
 */
const LEADING_MEASURE_OR_CONTAINER = new Set([
  // measures
  "pinch",
  "dash",
  "sprig",
  "sprigs",
  "bunch",
  "bunches",
  "clove",
  "cloves",
  "slice",
  "slices",
  "teaspoon",
  "teaspoons",
  "tsp",
  "tablespoon",
  "tablespoons",
  "tbsp",
  "cup",
  "cups",
  "ounce",
  "ounces",
  "oz",
  "pound",
  "pounds",
  "lb",
  "lbs",
  "gram",
  "grams",
  "g",
  "kilogram",
  "kilograms",
  "kg",
  "ml",
  "l",
  "liter",
  "liters",
  "litre",
  "litres",

  // containers
  "package",
  "packages",
  "pkg",
  "pack",
  "packs",
  "box",
  "boxes",
  "bag",
  "bags",
  "bottle",
  "bottles",
  "jar",
  "jars",
  "can",
  "cans",
  "carton",
  "cartons",
  "case",
  "cases",
  "tray",
  "trays",
  "tub",
  "tubs",
  "bundle",
  "bundles",
  "piece",
  "pieces",
  "pc",
  "pcs",
]);

function stripTailJunk(s: string) {
  let out = normalizeSpaces(s);
  let changed = true;
  while (changed) {
    changed = false;
    for (const re of TAIL_PHRASES) {
      if (re.test(out)) {
        out = out.replace(re, "").trim();
        changed = true;
      }
    }
  }
  return out;
}

function stripLeadingPrep(s: string) {
  let out = normalizeSpaces(s);
  if (!out) return out;

  let changed = true;
  while (changed) {
    changed = false;

    // remove combined phrases like "thinly sliced"
    out = out
      .replace(/^(thinly|finely|roughly|coarsely)\s+(sliced|chopped|diced|minced)\s+/i, "")
      .trim();

    for (const phrase of LEADING_PREP_WORDS.sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`^${phrase}\\s+`, "i");
      if (re.test(out)) {
        out = out.replace(re, "").trim();
        changed = true;
        break;
      }
    }
  }

  return out;
}

/**
 * Strip leading numeric measure like:
 * "1 oz cheddar" -> "cheddar"
 * "2 cups flour" -> "flour"
 */
function stripLeadingNumericMeasure(s: string) {
  let out = normalizeSpaces(s);
  if (!out) return out;

  const unitAlt = Array.from(LEADING_MEASURE_OR_CONTAINER)
    .filter((x) => !["package", "packages", "pkg", "pack", "packs", "box", "boxes", "bag", "bags", "bottle", "bottles", "jar", "jars", "can", "cans", "carton", "cartons", "case", "cases", "tray", "trays", "tub", "tubs", "bundle", "bundles", "piece", "pieces", "pc", "pcs"].includes(x))
    .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  // e.g. "1", "1.5", "1/2", "1 1/2"
  const re = new RegExp(
    `^(\\d+(?:\\.\\d+)?|\\d+\\/\\d+|\\d+\\s+\\d+\\/\\d+)\\s*(?:${unitAlt})\\b\\.?\\s+`,
    "i"
  );

  // repeat a couple times just in case
  for (let i = 0; i < 3; i++) {
    if (!re.test(out)) break;
    out = out.replace(re, "").trim();
  }

  return out;
}

/**
 * Strip leading measure/container words even when there is NO number:
 * "pinch oregano" -> "oregano"
 * "package jumbo" -> "jumbo" (then garbage-filter drops it)
 */
function stripLeadingMeasureWordsNoNumber(s: string) {
  let out = normalizeSpaces(s);
  if (!out) return out;

  let loops = 0;
  while (loops < 4) {
    const parts = out.split(" ").filter(Boolean);
    if (parts.length < 2) break;

    const first = parts[0].toLowerCase();
    if (!LEADING_MEASURE_OR_CONTAINER.has(first)) break;

    out = parts.slice(1).join(" ").trim();
    loops++;
  }

  return out;
}

function removeParentheticals(s: string) {
  return normalizeSpaces((s || "").replace(/\(([^)]+)\)/g, " "));
}

function cleanProductOnly(raw: string): string {
  let s = normalizeSpaces(raw);

  // bullets
  s = s.replace(/^[-*]+\s*/, "").trim();

  // remove parentheticals entirely
  s = removeParentheticals(s);

  // tail junk like "or more", "or to", "to taste"
  s = stripTailJunk(s);

  // leading numeric measures
  s = stripLeadingNumericMeasure(s);

  // leading measure/container words without number
  s = stripLeadingMeasureWordsNoNumber(s);

  // leading prep words
  s = stripLeadingPrep(s);

  // articles
  s = stripLeadingArticles(s);

  // €œeverything but the€ edge
  s = s.replace(/\beverything but the\b/i, "everything but").trim();

  s = normalizeSpaces(s);

  // If it collapses to garbage, drop it
  const low = s.toLowerCase();
  if (GARBAGE_BASES.has(low)) return "";

  // If it's a single tiny token, also treat as garbage
  const toks = low.split(" ").filter(Boolean);
  if (toks.length === 1 && toks[0].length <= 2) return "";

  return s;
}

function normalizeShoppingListInput(input: string): ShoppingIdent {
  const raw = String(input || "");
  const product = cleanProductOnly(raw);

  if (!product) {
    return { displayName: "", normalizedName: "" };
  }

  const key = stripLeadingArticles(normalizeForKey(product));

  return {
    displayName: product,
    normalizedName: key,
  };
}

// Manual add route uses this
export function normalizeShoppingListIdentifier(input: string): ShoppingIdent {
  return normalizeShoppingListInput(input);
}

// Derived sync route uses this
export function normalizeShoppingListIdentity(input: string): ShoppingIdent {
  return normalizeShoppingListInput(input);
}

