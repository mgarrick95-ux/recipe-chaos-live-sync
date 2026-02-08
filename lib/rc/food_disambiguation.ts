// lib/rc/food_disambiguation.ts

export type MatchTokens = {
  normalized: string;
  tokens: string[];
};

/**
 * "Mini eggs" are candy, not ingredient eggs.
 * This guard prevents false positives like:
 *   Fried Eggs <---> Cadbury Mini Eggs
 */
export function looksLikeCandyEggs(name: string): boolean {
  const s = safe(name).toLowerCase();

  // strong signals (most important)
  if (/\bmini\s+eggs?\b/.test(s)) return true;
  if (/\bcadbury\b/.test(s)) return true;

  // other candy-ish "egg" contexts
  if (/\bchocolate\s+eggs?\b/.test(s)) return true;
  if (/\bcandy\s+eggs?\b/.test(s)) return true;

  // common candy descriptors + eggs
  if (/\beggs?\b/.test(s) && /\b(chocolate|candy|sweets?|treats?)\b/.test(s)) return true;

  return false;
}

/**
 * Normalize to a predictable token set for matching.
 * Key behavior:
 * - Protects candy-eggs from donating "egg/eggs" tokens.
 * - Keeps things boring & stable. No AI guessing.
 */
export function normalizeForMatch(input: string): MatchTokens {
  let s = safe(input)
    .toLowerCase()
    .replace(/[®™]/g, "")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9\s\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Protect candy-eggs phrase BEFORE tokenization
  if (looksLikeCandyEggs(s)) {
    // keep it matchable to itself, but not to "eggs" recipes
    s = s
      .replace(/\bmini\s+eggs?\b/g, "mini_eggs")
      .replace(/\bchocolate\s+eggs?\b/g, "chocolate_eggs")
      .replace(/\bcandy\s+eggs?\b/g, "candy_eggs");
  }

  // Tokenize
  let tokens = s
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean);

  // If it's candy-eggs, explicitly remove generic egg tokens
  // (so "cadbury mini eggs" doesn't still match via "eggs")
  if (looksLikeCandyEggs(s)) {
    tokens = tokens.filter((t) => t !== "egg" && t !== "eggs");
  }

  // remove ultra-noise tokens that tend to cause false positives
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "of",
    "with",
    "for",
    "to",
    "in",
    "on",
    "now",
    "fresh",
    "original",
    "classic",
  ]);

  tokens = tokens.filter((t) => !stop.has(t));

  return { normalized: s, tokens };
}

function safe(v: unknown): string {
  return typeof v === "string" ? v : "";
}
