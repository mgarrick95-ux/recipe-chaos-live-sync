// lib/ingredientMatch.ts
import { looksLikeCandyEggs, normalizeForMatch } from "@/lib/rc/food_disambiguation";

export type StorageItem = {
  id: string;
  name?: string | null;
  item_name?: string | null;
  title?: string | null;
  location?: string | null;
  quantity?: number | null;
  qty?: number | null;
  count?: number | null;
  unit?: string | null;
  [key: string]: any;
};

function toPrettyString(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);

  if (typeof v === "object") {
    const picked = v.name ?? v.ingredient ?? v.text ?? v.value ?? v.label ?? v.title ?? null;
    if (typeof picked === "string" && picked.trim()) return picked.trim();

    // IMPORTANT:
    // Do NOT stringify unknown objects (prevents "[object Object]" polluting arrays)
    return "";
  }

  return "";
}

export function toStringArray(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((v) => toPrettyString(v))
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];

    // If it's a JSON array string, parse it.
    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        return toStringArray(JSON.parse(s));
      } catch {
        // fall through to comma-split
      }
    }

    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  const single = toPrettyString(value);
  return single ? [single.trim()].filter(Boolean) : [];
}

export function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pickStorageName(it: StorageItem): string {
  return (
    (it.name ?? "").toString().trim() ||
    (it.item_name ?? "").toString().trim() ||
    (it.title ?? "").toString().trim() ||
    (it.label ?? "").toString().trim() ||
    (it.food_name ?? "").toString().trim() ||
    ""
  );
}

export function pickStorageQty(it: StorageItem): number {
  const raw = it.quantity ?? it.qty ?? it.count ?? it.amount ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function pickStorageUnit(it: StorageItem): string | undefined {
  const u = (it.unit ?? it.qty_unit ?? it.uom ?? "").toString().trim();
  return u ? u : undefined;
}

export function pickStorageLocation(it: StorageItem): string | undefined {
  const l = (it.location ?? it.storage ?? it.area ?? "").toString().trim();
  return l ? l : undefined;
}

export type MatchKind = "exact" | "containment" | "token";

type StorageIndexRow = {
  qty: number;
  unit?: string;
  location?: string;
  rawName: string;

  // Matching metadata
  isCandyEggs: boolean;
  tokens: string[];
  normalizedForMatch: string;
};

export type IngredientMatchDetail = {
  ingredient: string;

  matched: boolean;
  matchKind: MatchKind | null;

  // what pantry thing we matched against (for UI marker copy)
  matchedStorageRawName: string | null;

  // convenience flags for UI
  isSoftMatch: boolean; // containment/token
};

export function buildStorageIndex(items: StorageItem[]) {
  const map = new Map<string, StorageIndexRow>();

  for (const it of items) {
    const rawName = pickStorageName(it);
    if (!rawName) continue;

    const key = norm(rawName);
    if (!key) continue;

    const qty = pickStorageQty(it);
    const unit = pickStorageUnit(it);
    const location = pickStorageLocation(it);

    const isCandyEggs = looksLikeCandyEggs(rawName);
    const match = normalizeForMatch(rawName);

    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        qty,
        unit,
        location,
        rawName,
        isCandyEggs,
        tokens: match.tokens,
        normalizedForMatch: match.normalized,
      });
    } else {
      map.set(key, { ...prev, qty: (prev.qty || 0) + (qty || 0) });
    }
  }

  return map;
}

/* =========================================================
   Token overlap fallback (deterministic, guarded)
========================================================= */

const GENERIC_TOKENS = new Set([
  "egg",
  "eggs",
  "salt",
  "pepper",
  "water",
  "oil",
  "sugar",
  "flour",
  "butter",
  "milk",
  "cheese",
  "garlic",
  "onion",
  "vanilla",
  "spice",
  "seasoning",
  "sauce",
  "mix",
  "powder",
]);

function ingredientWantsEggs(ingredient: string) {
  const t = normalizeForMatch(ingredient).tokens;
  return t.includes("egg") || t.includes("eggs");
}

function meaningfulTokens(tokens: string[]) {
  return tokens.filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t));
}

function tokenOverlapScore(a: string[], b: string[]) {
  const aSet = new Set(a);
  let overlap = 0;
  for (const t of b) if (aSet.has(t)) overlap++;
  return overlap;
}

function tokensMatchEnough(ingTokens: string[], storageTokens: string[]) {
  const a = meaningfulTokens(ingTokens);
  const b = meaningfulTokens(storageTokens);
  if (a.length === 0 || b.length === 0) return false;

  const overlap = tokenOverlapScore(a, b);
  if (a.length <= 2) return overlap >= 1;
  return overlap >= 2;
}

/* =========================================================
   Matching core (returns match kind + storage name)
========================================================= */

function matchIngredient(
  ingredient: string,
  storageIndex: Map<string, StorageIndexRow>
): { matched: boolean; matchKind: MatchKind | null; matchedStorageRawName: string | null } {
  const k = norm(ingredient);
  if (!k) return { matched: false, matchKind: null, matchedStorageRawName: null };

  const wantsEggs = ingredientWantsEggs(ingredient);
  const ingTokens = normalizeForMatch(ingredient).tokens;

  // 1) Exact
  const exact = storageIndex.get(k);
  if (exact && !(wantsEggs && exact.isCandyEggs)) {
    return { matched: true, matchKind: "exact", matchedStorageRawName: exact.rawName };
  }

  const entries = Array.from(storageIndex.entries());

  // 2) Containment
  const foundContainment = entries.find(([sk, row]) => {
    if (wantsEggs && row.isCandyEggs) return false;
    return sk === k || sk.includes(k) || k.includes(sk);
  });
  if (foundContainment) {
    return {
      matched: true,
      matchKind: "containment",
      matchedStorageRawName: foundContainment[1].rawName,
    };
  }

  // 3) Token overlap
  const foundToken = entries.find(([, row]) => {
    if (wantsEggs && row.isCandyEggs) return false;
    return tokensMatchEnough(ingTokens, row.tokens);
  });
  if (foundToken) {
    return {
      matched: true,
      matchKind: "token",
      matchedStorageRawName: foundToken[1].rawName,
    };
  }

  return { matched: false, matchKind: null, matchedStorageRawName: null };
}

/**
 * Summary result (backward compatible)
 */
export function summarizeIngredients(ingredients: string[], storageIndex: Map<string, StorageIndexRow>) {
  const cleaned = ingredients.map((s) => s.trim()).filter(Boolean);

  let haveCount = 0;
  let softHaveCount = 0;
  const missing: string[] = [];
  const details: IngredientMatchDetail[] = [];

  for (const ing of cleaned) {
    const res = matchIngredient(ing, storageIndex);

    if (res.matched) {
      haveCount++;
      const isSoft = res.matchKind === "containment" || res.matchKind === "token";
      if (isSoft) softHaveCount++;

      details.push({
        ingredient: ing,
        matched: true,
        matchKind: res.matchKind,
        matchedStorageRawName: res.matchedStorageRawName,
        isSoftMatch: isSoft,
      });
    } else {
      missing.push(ing);
      details.push({
        ingredient: ing,
        matched: false,
        matchKind: null,
        matchedStorageRawName: null,
        isSoftMatch: false,
      });
    }
  }

  const total = cleaned.length;
  return {
    total,
    haveCount,
    missing,
    allInStock: total > 0 && haveCount === total,

    // NEW: for UI marker
    softHaveCount,
    details,
  };
}

/**
 * Handles storage API response shapes:
 * - [...]
 * - { items: [...] }
 * - { data: [...] }
 * - { ok: true, items: [...] }
 */
export function parseStorageItems(json: any): StorageItem[] {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.items)) return json.items;
  if (Array.isArray(json?.data)) return json.data;
  return [];
}

/**
 * Handles recipe API response shapes:
 * - [...]
 * - { recipes: [...] }
 * - { data: [...] }
 */
export function parseRecipes(json: any): any[] {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.recipes)) return json.recipes;
  if (Array.isArray(json?.data)) return json.data;
  return [];
}
