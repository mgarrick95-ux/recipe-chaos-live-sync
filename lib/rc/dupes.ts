// lib/rc/dupes.ts
// Centralized “dupe / matching / canonicalization” helpers used by RC + FrostPantry.
// Conservative: suggest matches, never auto-merge.

export type Location = string;

export type StorageItem = {
  id: string;
  name: string | null;
  location?: Location | null;
  quantity?: number | null;
  unit?: string | null;
  use_by?: string | null;
  stored_on?: string | null;
  notes?: string | null;
};

export type StorageMatchIndex = {
  byStrict: Map<string, StorageItem[]>;
  byLoose: Map<string, StorageItem[]>;
};

export type MatchKind = "none" | "strict" | "loose";

export type StorageMatchResult = {
  kind: MatchKind;
  canonical: string; // canonical key used (strict or loose)
  matches: StorageItem[];
};

/* =========================
   Basic normalization
========================= */

const CONTAINER_WORDS = new Set([
  "bottle",
  "bottles",
  "can",
  "cans",
  "pack",
  "packs",
  "package",
  "packages",
  "pkg",
  "box",
  "boxes",
  "bag",
  "bags",
  "jar",
  "jars",
  "carton",
  "cartons",
  "case",
  "cases",
  "loaf",
  "loaves",
  "bundle",
  "bundles",
  "tray",
  "trays",
  "tub",
  "tubs",
  "cup",
  "cups",
  "pcs",
  "pc",
  "piece",
  "pieces",
  "bunch",
  "bunches",
]);

const PREP_WORDS = [
  "fresh",
  "freshly",
  "chopped",
  "finely",
  "roughly",
  "coarsely",
  "diced",
  "minced",
  "sliced",
  "thinly",
  "grated",
  "peeled",
  "seeded",
  "crushed",
  "drained",
  "rinsed",
  "optional",
  "divided",
  "to",
  "taste",
];

function normalizeFractionChars(raw: string): string {
  return (raw || "")
    .replace(/[\u2044\u2215\uFF0F]/g, "/")
    .replace(/\u00BC/g, " 1/4 ")
    .replace(/\u00BD/g, " 1/2 ")
    .replace(/\u00BE/g, " 3/4 ")
    .replace(/\u2153/g, " 1/3 ")
    .replace(/\u2154/g, " 2/3 ")
    .replace(/\u215B/g, " 1/8 ")
    .replace(/\u215C/g, " 3/8 ")
    .replace(/\u215D/g, " 5/8 ")
    .replace(/\u215E/g, " 7/8 ");
}

function stripParens(raw: string): string {
  // Remove parenthetical notes for matching (“(optional)”, “(for garnish)”, brands, etc.)
  return (raw || "").replace(/\(([^)]+)\)/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeNameCore(input: string): string {
  return (input || "")
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * cleanName:
 * Human cleanup pass used before canonicalization.
 */
export function cleanName(raw: string): string {
  let s = normalizeFractionChars(raw || "").trim();
  s = s.replace(/^[-•*]+\s*/, "").trim();
  s = stripParens(s);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function tokensAll(raw: string): string[] {
  const s = normalizeNameCore(cleanName(raw));
  return s
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean);
}

function tokensNoContainers(raw: string): string[] {
  return tokensAll(raw).filter((t) => !CONTAINER_WORDS.has(t));
}

function tokensLoose(raw: string): string[] {
  // More aggressive: drop containers + common prep fluff
  const drop = new Set([...CONTAINER_WORDS, ...PREP_WORDS]);
  return tokensAll(raw).filter((t) => t.length >= 2 && !drop.has(t));
}

function isMeaningful(tokens: string[]): boolean {
  if (tokens.length >= 2) return true;
  if (tokens.length === 1) return tokens[0].length >= 4;
  return false;
}

/**
 * canonicalizeStrict:
 * Stable key for “same item” matching.
 * Drops container words (“carton”, “bag”), keeps meaningful tokens.
 */
export function canonicalizeStrict(raw: string): string {
  const toks = tokensNoContainers(raw).filter((t) => t.length >= 2);
  if (!isMeaningful(toks)) return "";
  return toks.join(" ").trim();
}

/**
 * canonicalizeLoose:
 * More forgiving key for “probably the same thing”.
 * Drops containers + prep fluff.
 */
export function canonicalizeLoose(raw: string): string {
  const toks = tokensLoose(raw);
  if (!isMeaningful(toks)) return "";
  return toks.join(" ").trim();
}

/* =========================
   Index builder
========================= */

export function buildStorageMatchIndex(items: StorageItem[]): StorageMatchIndex {
  const byStrict = new Map<string, StorageItem[]>();
  const byLoose = new Map<string, StorageItem[]>();

  for (const it of items || []) {
    const name = (it?.name || "").trim();
    if (!name) continue;

    // ignore explicit zero qty rows if you store them
    if (typeof it.quantity === "number" && it.quantity === 0) continue;

    const strict = canonicalizeStrict(name);
    const loose = canonicalizeLoose(name);

    if (strict) {
      const arr = byStrict.get(strict) || [];
      arr.push(it);
      byStrict.set(strict, arr);
    }

    if (loose) {
      const arr = byLoose.get(loose) || [];
      arr.push(it);
      byLoose.set(loose, arr);
    }
  }

  return { byStrict, byLoose };
}

/* =========================
   Unit compatibility
========================= */

type UnitFamily = "volume" | "mass" | "count" | "unknown";

function normalizeUnit(u?: string | null): string {
  const s = (u || "").toLowerCase().trim();
  if (!s) return "";

  if (s === "ounces" || s === "ounce") return "oz";
  if (s === "grams" || s === "gram") return "g";
  if (s === "kilograms" || s === "kilogram") return "kg";
  if (s === "pounds" || s === "pound") return "lb";
  if (s === "liters" || s === "litres" || s === "liter" || s === "litre")
    return "l";
  if (s === "milliliters" || s === "millilitres") return "ml";
  if (s === "tablespoons" || s === "tablespoon") return "tbsp";
  if (s === "teaspoons" || s === "teaspoon") return "tsp";
  if (s === "count" || s === "ct" || s === "each") return "ct";

  return s;
}

function unitFamily(u?: string | null): UnitFamily {
  const nu = normalizeUnit(u);
  if (!nu) return "unknown";

  if (["ml", "l", "tsp", "tbsp", "cup", "cups", "fl oz", "floz"].includes(nu))
    return "volume";
  if (["g", "kg", "oz", "lb"].includes(nu)) return "mass";
  if (["ct", "pc", "pcs", "piece", "pieces"].includes(nu)) return "count";

  return "unknown";
}

/**
 * unitsCompatible:
 * Conservative: if either unit is missing/unknown, treat as compatible.
 * This is for prompting, not auto-math conversions.
 */
export function unitsCompatible(a?: string | null, b?: string | null): boolean {
  const fa = unitFamily(a);
  const fb = unitFamily(b);
  if (fa === "unknown" || fb === "unknown") return true;
  return fa === fb;
}

/* =========================
   Match helper used by ReceiptScanTool
========================= */

function looksLikeIndex(x: unknown): x is StorageMatchIndex {
  return (
    !!x &&
    typeof x === "object" &&
    (x as any).byStrict instanceof Map &&
    (x as any).byLoose instanceof Map
  );
}

function matchWithIndex(
  index: StorageMatchIndex,
  name: string,
  unit?: string | null,
  limit = 8
): StorageMatchResult {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 8));
  const cleaned = cleanName(name || "");

  const strictKey = canonicalizeStrict(cleaned);
  if (strictKey) {
    const strictMatches = (index?.byStrict?.get(strictKey) || []).filter((s) =>
      unitsCompatible(unit ?? null, s.unit ?? null)
    );
    if (strictMatches.length > 0) {
      return {
        kind: "strict",
        canonical: strictKey,
        matches: strictMatches.slice(0, safeLimit),
      };
    }
  }

  const looseKey = canonicalizeLoose(cleaned);
  if (looseKey) {
    const looseMatches = (index?.byLoose?.get(looseKey) || []).filter((s) =>
      unitsCompatible(unit ?? null, s.unit ?? null)
    );
    if (looseMatches.length > 0) {
      return {
        kind: "loose",
        canonical: looseKey,
        matches: looseMatches.slice(0, safeLimit),
      };
    }
  }

  return { kind: "none", canonical: strictKey || looseKey || "", matches: [] };
}

/**
 * matchToStorage
 * Accepts BOTH call orders to stay compatible with older code:
 *   matchToStorage(index, name, unit?, limit?)
 *   matchToStorage(name, index, unit?, limit?)
 */
export function matchToStorage(
  a: StorageMatchIndex | string,
  b: StorageMatchIndex | string,
  unit?: string | null,
  limit = 8
): StorageMatchResult {
  if (looksLikeIndex(a) && typeof b === "string") {
    return matchWithIndex(a, b, unit, limit);
  }
  if (looksLikeIndex(b) && typeof a === "string") {
    return matchWithIndex(b, a, unit, limit);
  }
  // Fallback (bad call): return none rather than crashing
  const name = typeof a === "string" ? a : typeof b === "string" ? b : "";
  return { kind: "none", canonical: canonicalizeStrict(name) || "", matches: [] };
}
