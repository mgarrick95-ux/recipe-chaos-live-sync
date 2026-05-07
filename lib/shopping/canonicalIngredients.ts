export type MilkKind =
  | { kind: "none" }
  | { kind: "dairy"; variants: string[] }
  | { kind: "plant"; plantType: string };

export const CONTAINER_WORDS = new Set([
  "bottle", "bottles",
  "can", "cans",
  "pack", "packs",
  "package", "packages", "pkg",
  "box", "boxes",
  "bag", "bags",
  "jar", "jars",
  "carton", "cartons",
  "case", "cases",
  "loaf", "loaves",
  "bundle", "bundles",
  "tray", "trays",
  "tub", "tubs",
  "cup", "cups",
  "pcs", "pc",
  "piece", "pieces",
  "bunch", "bunches",
]);

const DIFFERENT_PRODUCT_MARKERS = new Set([
  "powder",
  "powdered",
  "granules",
  "flakes",
  "flaked",
  "seasoning",
  "seasoned",
  "salt",
  "salts",
  "extract",
  "concentrate",
]);

const PLANT_MILK_MARKERS = new Set([
  "almond",
  "oat",
  "soy",
  "soya",
  "coconut",
  "cashew",
  "rice",
  "hemp",
  "pea",
  "macadamia",
]);

const DAIRY_MILK_VARIANTS = new Set([
  "whole",
  "skim",
  "nonfat",
  "fatfree",
  "fat-free",
  "lowfat",
  "low-fat",
  "reducedfat",
  "reduced-fat",
  "2%",
  "1%",
  "2",
  "1",
]);

function normalizeName(input: string) {
  return (input || "")
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_~()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokensAll(rawDisplay: string): string[] {
  const norm = normalizeName(rawDisplay);
  return norm
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 1);
}

export function tokensForName(rawDisplay: string): string[] {
  const norm = normalizeName(rawDisplay);
  const tokens = norm
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !CONTAINER_WORDS.has(t));

  return tokens.filter((t) => t.length >= 2);
}

function canonicalizeTokens(tokens: string[]) {
  const tokenSet = new Set(tokens);

  // Sugar family guardrail:
  // granulated/white sugar are plain sugar for shopping-list purposes.
  // Brown/powdered/confectioners sugar intentionally stay distinct.
  if (tokenSet.has("sugar")) {
    const hasDistinctSugarType =
      tokenSet.has("brown") ||
      tokenSet.has("powdered") ||
      tokenSet.has("confectioners") ||
      tokenSet.has("icing");

    if (!hasDistinctSugarType) {
      return ["sugar"];
    }
  }

  // Butter family:
  // salted/unsalted/melted/softened butter are still butter for buy-list purposes.
  if (tokenSet.has("butter")) {
    const hasDistinctButterType =
      tokenSet.has("peanut") ||
      tokenSet.has("almond") ||
      tokenSet.has("apple");

    if (!hasDistinctButterType) {
      return ["butter"];
    }
  }

  return tokens;
}

export function canonicalKey(rawDisplay: string): string {
  return canonicalizeTokens(tokensForName(rawDisplay)).join(" ").trim();
}

export function isMeaningfulTokenSet(tokens: string[]) {
  if (tokens.length >= 2) return true;
  if (tokens.length === 1) return tokens[0].length >= 4;
  return false;
}

export function tokenSubsetMatch(a: string[], b: string[]): boolean {
  if (!isMeaningfulTokenSet(a) || !isMeaningfulTokenSet(b)) return false;

  const aSet = new Set(a);
  const bSet = new Set(b);
  const [small, large] = aSet.size <= bSet.size ? [aSet, bSet] : [bSet, aSet];

  let matched = 0;
  for (const t of small) if (large.has(t)) matched++;
  return matched === small.size;
}

export function detectMilkKind(rawName: string): MilkKind {
  const toks = tokensAll(rawName);
  const hasMilk = toks.includes("milk");
  if (!hasMilk) return { kind: "none" };

  const plant = toks.find((t) => PLANT_MILK_MARKERS.has(t));
  if (plant) return { kind: "plant", plantType: plant };

  const variants = toks
    .map((t) => t.toLowerCase())
    .filter((t) => DAIRY_MILK_VARIANTS.has(t))
    .map((t) => {
      if (t === "fat free") return "fat-free";
      return t;
    });

  const uniq = Array.from(new Set(variants));
  uniq.sort();

  return { kind: "dairy", variants: uniq };
}

export function isDifferentProductByMarkers(aRaw: string, bRaw: string): boolean {
  const a = new Set(tokensAll(aRaw));
  const b = new Set(tokensAll(bRaw));

  for (const m of DIFFERENT_PRODUCT_MARKERS) {
    const aHas = a.has(m);
    const bHas = b.has(m);
    if (aHas !== bHas) return true;
  }

  const aSugar = a.has("sugar");
  const bSugar = b.has("sugar");

  if (aSugar && bSugar) {
    const sugarTypeMarkers = ["brown", "powdered", "confectioners", "icing"];
    for (const marker of sugarTypeMarkers) {
      if (a.has(marker) !== b.has(marker)) return true;
    }
  }

  const aGarlic = a.has("garlic");
  const bGarlic = b.has("garlic");

  if (aGarlic && bGarlic) {
    const aPowder = a.has("powder") || a.has("powdered");
    const bPowder = b.has("powder") || b.has("powdered");
    if (aPowder !== bPowder) return true;
  }

  return false;
}


