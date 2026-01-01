// lib/recipeSuggestions.ts
type AnyRecipe = Record<string, any>;

export type SuggestedRecipe = {
  id: string;
  title: string;
  description?: string | null;
  tags: string[];
  ingredients: string[];
  source_url?: string | null;
  source_name?: string | null;
};

function toStringArray(input: any): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((x) => String(x).trim()).filter(Boolean);
  if (typeof input === "string") {
    return input
      .split(/[,|]/g)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function parseAvoidRaw(avoidRaw: string): string[] {
  return (avoidRaw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function containsAvoid(text: string, avoid: string[]): boolean {
  const t = (text || "").toLowerCase();
  return avoid.some((bad) => bad && t.includes(bad));
}

function safeTagify(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 28);
}

function computePreferredTags(recipes: AnyRecipe[]): string[] {
  const score = new Map<string, number>();

  for (const r of recipes) {
    const tags = toStringArray(r.tags);
    const fav = Boolean(r.favorite);

    for (const t of tags) {
      const key = String(t).trim().toLowerCase();
      if (!key) continue;
      const inc = fav ? 3 : 1;
      score.set(key, (score.get(key) ?? 0) + inc);
    }
  }

  return Array.from(score.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .slice(0, 10);
}

/**
 * Starter suggestion pool (local).
 * Some items include URLs; others are URL-less so "Save" can prefill manual mode.
 */
function buildStubPool(preferredTags: string[]): SuggestedRecipe[] {
  const base: SuggestedRecipe[] = [
    {
      id: "stub-gf-1",
      title: "Flourless Chocolate Cake (GF)",
      description: "Dense chocolate cake, gluten-free, minimal drama.",
      tags: ["dessert", "gluten-free", "baking"],
      ingredients: ["chocolate", "butter", "eggs", "sugar", "cocoa"],
      source_url: "https://glutenfreeonashoestring.com/flourless-chocolate-cake/",
      source_name: "Gluten Free on a Shoestring",
    },
    {
      id: "stub-nourl-1",
      title: "Big-Batch Beef Chili (Freezer Friendly)",
      description: "Hearty chili you’ll happily eat twice (or five times).",
      tags: ["beef", "batch", "freezer", "comfort"],
      ingredients: ["ground beef", "onion", "beans", "tomato", "chili powder"],
      source_url: null,
      source_name: null,
    },
    {
      id: "stub-nourl-2",
      title: "Honey Garlic Pork Chops (Weeknight)",
      description: "Sticky-sweet weeknight pork chops with garlic vibes.",
      tags: ["pork", "weeknight", "sweet-savory"],
      ingredients: ["pork chops", "honey", "garlic", "soy sauce", "vinegar"],
      source_url: null,
      source_name: null,
    },
    {
      id: "stub-nourl-3",
      title: "Meatloaf + Mashed Potatoes Night",
      description: "Comfort food that behaves. Leftovers do the next day’s job.",
      tags: ["beef", "comfort", "leftovers"],
      ingredients: ["ground beef", "egg", "breadcrumbs (GF if needed)", "ketchup", "potatoes"],
      source_url: null,
      source_name: null,
    },
    {
      id: "stub-url-2",
      title: "Sheet Pan Chicken & Veg (Weeknight)",
      description: "One pan, minimal dishes, actual food.",
      tags: ["chicken", "sheet-pan", "easy"],
      ingredients: ["chicken", "carrots", "potatoes", "onion", "seasoning"],
      source_url: "https://www.budgetbytes.com/oven-fajitas/",
      source_name: "Budget Bytes",
    },
    {
      id: "stub-url-3",
      title: "Simple Garlic Butter Steak Bites",
      description: "Fast, high-reward, no novel required.",
      tags: ["beef", "quick", "stovetop"],
      ingredients: ["steak", "butter", "garlic", "salt", "pepper"],
      source_url: "https://www.spendwithpennies.com/garlic-butter-steak-bites/",
      source_name: "Spend With Pennies",
    },
  ];

  const top = preferredTags.slice(0, 3).map(safeTagify).filter(Boolean);
  if (top.length) {
    for (const r of base) {
      r.tags = Array.from(new Set([...r.tags, ...top])).slice(0, 6);
    }
  }

  return base;
}

// Deterministic seeded RNG + shuffle (so refresh changes list)
function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const seedFn = xmur3(seed);
  const rand = mulberry32(seedFn());
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function generateSuggestedRecipes(opts: {
  recipes: AnyRecipe[];
  avoidRaw: string;
  limit?: number;
  seed?: string; // NEW: controls shuffle variation
}): { preferredTags: string[]; suggestions: SuggestedRecipe[] } {
  const { recipes, avoidRaw, limit = 12, seed = "" } = opts;

  const preferredTags = computePreferredTags(recipes || []);
  const avoid = parseAvoidRaw(avoidRaw);

  const pool = buildStubPool(preferredTags);

  const filtered = pool.filter((s) => {
    const blob = [
      s.title,
      s.description ?? "",
      s.tags.join(" "),
      s.ingredients.join(" "),
      s.source_url ?? "",
    ].join(" ");
    return !containsAvoid(blob, avoid);
  });

  // Rank by preferred tag overlap (stable ordering)
  const prefSet = new Set(preferredTags.map((t) => t.toLowerCase()));
  const ranked = [...filtered].sort((a, b) => {
    const aScore = a.tags.reduce((acc, t) => acc + (prefSet.has(String(t).toLowerCase()) ? 1 : 0), 0);
    const bScore = b.tags.reduce((acc, t) => acc + (prefSet.has(String(t).toLowerCase()) ? 1 : 0), 0);
    return bScore - aScore;
  });

  // Then shuffle within that ranked set so you get variety but still "good" ones near the top
  const shuffled = seed ? seededShuffle(ranked, seed) : ranked;

  return {
    preferredTags,
    suggestions: shuffled.slice(0, limit),
  };
}
