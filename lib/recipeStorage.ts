// lib/recipeStorage.ts
export type StorageItem = {
  id: string;
  name?: string | null;
  item_name?: string | null; // tolerate older field names
  title?: string | null;     // tolerate older field names
  quantity?: number | null;
  qty?: number | null;
  unit?: string | null;
  location?: string | null;
  stored_on?: string | null;
  use_by?: string | null;
};

export type NormalizedStorageItem = {
  id: string;
  name: string;       // normalized display name (original trimmed)
  key: string;        // normalized matching key
  quantity: number | null;
  unit: string | null;
  location: string | null;
};

export type StorageLoadState =
  | { ok: true; items: NormalizedStorageItem[]; count: number }
  | { ok: false; items: NormalizedStorageItem[]; count: number; error: string };

function normalizeWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

// “Good enough” normalization: lower, remove punctuation, collapse spaces
// We DO NOT try to be clever with “ground beef vs beef” yet — that’s Option C/D.
export function normalizeKey(input: unknown): string {
  const raw = typeof input === "string" ? input : String(input ?? "");
  const s = normalizeWhitespace(raw).toLowerCase();

  // strip common punctuation, keep letters/numbers/spaces
  const cleaned = s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  // tiny plural softener: noodles -> noodle, spices -> spice (simple trailing s)
  // doesn’t affect words like "glass" (becomes "glas")? it would; so keep conservative:
  // only strip trailing "s" if word length > 3
  const parts = cleaned.split(" ").map((w) => {
    if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
    return w;
  });

  return parts.join(" ").trim();
}

export function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];

    // JSON array string
    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        const parsed = JSON.parse(s);
        return toStringArray(parsed);
      } catch {
        // fall through
      }
    }

    // comma separated
    return s.split(",").map((x) => x.trim()).filter(Boolean);
  }

  return [String(value)].map((s) => s.trim()).filter(Boolean);
}

export function normalizeStorageItems(raw: StorageItem[]): NormalizedStorageItem[] {
  return (raw ?? [])
    .map((it) => {
      const display =
        (it.name ?? it.item_name ?? it.title ?? "").toString().trim();

      return {
        id: String(it.id ?? ""),
        name: display,
        key: normalizeKey(display),
        quantity:
          typeof it.quantity === "number"
            ? it.quantity
            : typeof it.qty === "number"
              ? it.qty
              : it.quantity == null && it.qty == null
                ? null
                : Number(it.quantity ?? it.qty) || null,
        unit: it.unit ?? null,
        location: it.location ?? null,
      };
    })
    .filter((x) => x.id && x.key);
}

export async function loadStorageItems(): Promise<StorageLoadState> {
  try {
    const res = await fetch("/api/storage-items", { cache: "no-store" });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        ok: false,
        items: [],
        count: 0,
        error: (json?.error as string) || `Storage load failed (${res.status})`,
      };
    }

    const raw = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : [];
    const items = normalizeStorageItems(raw);
    return { ok: true, items, count: items.length };
  } catch (e: any) {
    return { ok: false, items: [], count: 0, error: e?.message || "Storage load failed" };
  }
}

export type IngredientMatch =
  | { status: "in"; ingredient: string; item: NormalizedStorageItem }
  | { status: "missing"; ingredient: string };

export function matchIngredients(
  ingredients: string[],
  storage: NormalizedStorageItem[]
): IngredientMatch[] {
  const storageByKey = new Map<string, NormalizedStorageItem>();
  for (const s of storage) storageByKey.set(s.key, s);

  return (ingredients ?? []).map((ing) => {
    const key = normalizeKey(ing);
    const found = storageByKey.get(key);
    if (found) return { status: "in", ingredient: ing, item: found };
    return { status: "missing", ingredient: ing };
  });
}

export function summarizeMatches(matches: IngredientMatch[]) {
  const total = matches.length;
  const have = matches.filter((m) => m.status === "in").length;
  const missing = matches.filter((m) => m.status === "missing").length;
  return { total, have, missing, allInStock: total > 0 && missing === 0 };
}
