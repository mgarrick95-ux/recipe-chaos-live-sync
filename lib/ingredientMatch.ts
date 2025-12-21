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

export function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];
    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        return toStringArray(JSON.parse(s));
      } catch {}
    }
    return s.split(",").map((x) => x.trim()).filter(Boolean);
  }

  return [String(value)].map((s) => s.trim()).filter(Boolean);
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

export function buildStorageIndex(items: StorageItem[]) {
  const map = new Map<string, { qty: number; unit?: string; location?: string; rawName: string }>();

  for (const it of items) {
    const rawName = pickStorageName(it);
    if (!rawName) continue;

    const key = norm(rawName);
    if (!key) continue;

    const qty = pickStorageQty(it);
    const unit = pickStorageUnit(it);
    const location = pickStorageLocation(it);

    const prev = map.get(key);
    if (!prev) {
      map.set(key, { qty, unit, location, rawName });
    } else {
      map.set(key, { ...prev, qty: (prev.qty || 0) + (qty || 0) });
    }
  }

  return map;
}

/**
 * This is intentionally "simple + stable" (same behavior we’ve been using):
 * - exact normalized match
 * - containment match as a fallback
 */
export function summarizeIngredients(
  ingredients: string[],
  storageIndex: Map<string, { qty: number; unit?: string; location?: string; rawName: string }>
) {
  const cleaned = ingredients.map((s) => s.trim()).filter(Boolean);
  const storageKeys = Array.from(storageIndex.keys());

  let haveCount = 0;
  const missing: string[] = [];

  for (const ing of cleaned) {
    const k = norm(ing);
    if (!k) continue;

    const exact = storageIndex.get(k);
    if (exact) {
      haveCount++;
      continue;
    }

    const foundKey = storageKeys.find((sk) => sk === k || sk.includes(k) || k.includes(sk));
    if (foundKey) {
      haveCount++;
    } else {
      missing.push(ing);
    }
  }

  const total = cleaned.length;
  return {
    total,
    haveCount,
    missing,
    allInStock: total > 0 && haveCount === total,
  };
}

/**
 * Handles the storage API response shapes:
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
