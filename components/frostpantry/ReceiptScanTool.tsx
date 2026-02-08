// components/frostpantry/ReceiptScanTool.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildStorageMatchIndex,
  canonicalizeLoose,
  canonicalizeStrict,
  cleanName,
  type Location,
  matchToStorage,
  type MatchKind,
  type StorageItem,
  unitsCompatible,
} from "@/lib/rc/dupes";

/* =========================================================
   Types
========================================================= */

type ParsedReceiptItem = {
  name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
};

type ReceiptParseResponse = {
  items?: ParsedReceiptItem[];
  error?: string;
  message?: string;
  debug?: any;
};

type ReceiptRow = {
  id: string;

  checked: boolean;
  name: string;
  quantity: number;
  unit: string | null;
  location: Location | null;
  stored_on: string | null;
  use_by: string | null;
  notes: string;

  canonLoose: string;
  canonStrict: string;
  dupGroupKey: string | null;
  matchKind: MatchKind | null;
  matchedStorage: StorageItem[];
  matchLabel: string | null;

  useByTouched: boolean;
};

/* =========================================================
   Name normalization
========================================================= */

function normalizePurchaseItemName(raw: string) {
  let s = cleanName(raw || "");
  if (!s) return s;

  const trimTail = (v: string) => v.replace(/[,\-–—:\s]+$/g, "").trim();

  // Strip “sold in ...” tail
  s = s.replace(/\s*,?\s*sold in\s+(singles?|each|bulk|bunch(es)?|bags?)\b.*$/i, "");
  s = trimTail(s);

  // Strip size ranges and single sizes at end
  s = s.replace(
    /\s*,?\s*\d+(\.\d+)?\s*-\s*\d+(\.\d+)?\s*(kg|g|lb|lbs|oz|ml|l|liters?|litres?)\b\.?\s*$/i,
    ""
  );
  s = trimTail(s);

  s = s.replace(
    /\s*,?\s*\d+(\.\d+)?\s*(kg|g|lb|lbs|oz|ml|l|liters?|litres?)\b\.?\s*$/i,
    ""
  );
  s = trimTail(s);

  s = s.replace(/\s*\b\d+(\.\d+)?(kg|g|lb|lbs|oz|ml|l)\b\.?\s*$/i, "");
  s = trimTail(s);

  // Strip “6 x 710 mL” tail style
  s = s.replace(
    /\s*,?\s*\d+(\.\d+)?\s*[x×]\s*\d*(\.\d+)?\s*(kg|g|lb|lbs|oz|ml|l|liters?|litres?)\b\.?\s*$/i,
    ""
  );
  s = trimTail(s);

  // Strip pack/count at end
  s = s.replace(/\s*,?\s*\d+\s*(pack|pk|ct|count)\b\.?\s*$/i, "");
  s = trimTail(s);

  // Strip trailing “6 x”
  s = s.replace(/\s*,?\s*\d+\s*[x×]\s*$/i, "");
  s = trimTail(s);

  // Strip origin/prep tails
  s = s.replace(/\s*,?\s*(prepared in|made in|product of|imported)\b[^,]*$/i, "");
  s = trimTail(s);

  // If it ends with a stray number, drop it
  if (/(,|\s)\d+(\.\d+)?\s*$/.test(s) && /[a-zA-Z]/.test(s)) {
    s = s.replace(/\s*,?\s*\d+(\.\d+)?\s*$/i, "");
    s = trimTail(s);
  }

  // Drop pure meta comma parts
  const parts = s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length > 1) {
    const isPureMeta = (p: string) => {
      const t = p.trim();
      if (/^\d+(\.\d+)?\s*(ml|l|g|kg|oz|lb|lbs)\b\.?$/i.test(t)) return true;
      if (/^\d+(\.\d+)?(ml|l|g|kg|oz|lb|lbs)\b\.?$/i.test(t)) return true;
      if (/^\d+\s*(pack|pk|ct|count)\b\.?$/i.test(t)) return true;
      if (/^\d+\s*[x×]\s*$/i.test(t)) return true;
      return false;
    };

    const nextParts = parts.filter((p) => !isPureMeta(p));
    if (nextParts.length > 0) s = nextParts.join(", ");
  }

  // Drop trailing paren-weight like “(140 gummies)”
  if (/\(\s*\d+[^)]*\)\s*$/i.test(s)) {
    s = s.replace(/\s*\(\s*\d+[^)]*\)\s*$/i, "");
    s = trimTail(s);
  }

  // ✅ De-brand + reduce to useful name (but not too generic)
  s = toCommonName(s);

  return s || cleanName(raw || "");
}

/**
 * Convert receipt product titles into “what a human would call it”,
 * BUT keep *signal* for snack categories (chips/candy/crackers).
 *
 * Examples:
 * - "Breton Gluten Free Garden Vegetable Crackers, Dare" -> "Breton Crackers — Gluten Free"
 * - "Chef Boyardee Beefaroni Pasta..." -> "Beefaroni"
 * - "Dare Juicee Beans Candy, Jelly Beans" -> "Dare Juicee Beans Jelly Beans"
 */
function toCommonName(input: string) {
  let s = cleanName(input || "");
  if (!s) return s;

  s = s.replace(/[®™]/g, "");
  s = s.replace(/\s+/g, " ").trim();

  const lower = s.toLowerCase();

  // Explicit defaults you asked for
  if (/\bcoca[-\s]?cola\b/.test(lower)) return "Coke";
  if (/\bmini\s+eggs\b/.test(lower)) return "Mini eggs";

  const hasGF = /\bgluten\s*free\b|\bgf\b/i.test(s);

  // classify as “snack-ish” where brand helps you differentiate
  const isSnack =
    /\b(crackers?|chips?|candy|chocolate|cookies?|pretzels?|snacks?)\b/i.test(s);

  // Brand handling:
  // - always drop these (you said "don’t need boyardee")
  const alwaysDropBrands = [
    "Chef Boyardee",
    "Dairyland",
    "Great Value",
    "Mann's",
    "Manns",
    "Bergeron",
    "Mastro",
    "Vitafusion",
    "Our Finest",
  ];

  // - keep these *only for snack items* (they’re useful signal)
  const keepBrandsForSnacks = ["Breton", "Cadbury", "Dare", "Town House", "Kellogg's", "Kelloggs"];

  // If snack + starts with keep-brand, preserve it
  let keptBrand: string | null = null;
  if (isSnack) {
    for (const b of keepBrandsForSnacks) {
      const re = new RegExp(`^${escapeRegExp(b)}\\b`, "i");
      if (re.test(s)) {
        keptBrand = b;
        break;
      }
    }
  }

  // Remove always-drop brands if present at start
  for (const b of alwaysDropBrands) {
    const re = new RegExp(`^${escapeRegExp(b)}\\b\\s*`, "i");
    s = s.replace(re, "");
  }

  // If we kept a snack brand, remove it temporarily so we can extract the core noun phrase cleanly
  if (keptBrand) {
    const re = new RegExp(`^${escapeRegExp(keptBrand)}\\b\\s*`, "i");
    s = s.replace(re, "");
  }

  // strip mild fluff words
  s = s.replace(/\b(original|classic|signature|premium|extra|mature|stringless|mini-bites|garden vegetable|chocolatey)\b/gi, " ");
  s = s.replace(/\s+/g, " ").trim();

  // Work on the first chunk; receipts love comma soup
  const firstChunk = s.split(",")[0]?.trim() || s;

  // phrase wins (most “human”)
  const phraseRules: Array<{ test: RegExp; out: string }> = [
    { test: /\bsour cream\b/i, out: "Sour cream" },
    { test: /\bjelly beans\b/i, out: "Jelly beans" },
    { test: /\bjuicee beans\b/i, out: "Juicee Beans" },
    { test: /\bsnap peas\b/i, out: "Snap peas" },
    { test: /\bmini cucumbers\b/i, out: "Mini cucumbers" },
    { test: /\bbeefaroni\b/i, out: "Beefaroni" },
    { test: /\bravioli\b/i, out: "Ravioli" },
    { test: /\bcheddar\b/i, out: "Cheddar cheese" },
  ];

  let core: string | null = null;

  // For snack items, try to keep “what kind” (not just “candy”)
  if (isSnack) {
    // If line contains a specific candy/snack phrase, use it (and allow stacking)
    const picks: string[] = [];
    for (const rule of phraseRules) {
      if (rule.test.test(firstChunk)) picks.push(rule.out);
    }

    // If nothing matched, fall back to a trimmed chunk but avoid single generic category words
    if (picks.length > 0) {
      // de-dupe
      core = Array.from(new Set(picks)).join(" ");
    } else {
      // Remove generic category-only words if they’d be the entire output
      let tmp = firstChunk
        .replace(/\b(candy|snack|snacks|chips|crackers|cracker|chocolate)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

      // If that made it empty, then keep the category (better than blank)
      if (!tmp) tmp = firstChunk.trim();

      // shorten very long snack names but keep 2–6 words so it’s identifiable
      const w = tmp.split(" ").filter(Boolean);
      if (w.length > 7) tmp = w.slice(0, 7).join(" ");

      core = capitalize(tmp);
    }
  } else {
    // Non-snack items: more aggressive simplification is fine
    for (const rule of phraseRules) {
      if (rule.test.test(firstChunk)) {
        core = rule.out;
        break;
      }
    }

    if (!core) {
      const nouns = [
        "sour cream",
        "cream",
        "cheddar cheese",
        "cheese",
        "cucumbers",
        "peas",
        "beans",
        "ravioli",
        "meatballs",
        "charcuterie",
        "veggie tray",
        "tray",
        "dip",
      ];

      const words = firstChunk.split(" ").filter(Boolean);
      const joinedLower = words.join(" ").toLowerCase();

      for (const n of nouns.sort((a, b) => b.length - a.length)) {
        if (joinedLower.includes(n)) {
          core = capitalize(n);
          break;
        }
      }
    }

    if (!core) {
      let tmp = firstChunk.trim();
      const w = tmp.split(" ").filter(Boolean);
      if (w.length > 6) tmp = w.slice(0, 6).join(" ");
      core = capitalize(tmp);
    }
  }

  // Reapply kept brand for snack items
  let out = core || capitalize(firstChunk.trim());

  if (keptBrand) {
    // Avoid doubling if core already starts with brand
    const lowerOut = out.toLowerCase();
    if (!lowerOut.startsWith(keptBrand.toLowerCase())) {
      out = `${keptBrand} ${out}`.trim();
    }
  }

  // Gluten Free formatting:
  // You asked for “Breton Crackers - Gluten Free” style (suffix is clearer in lists).
  if (hasGF) {
    if (!/gluten[-\s]?free/i.test(out)) out = `${out} — Gluten Free`;
  }

  // Last safety: don’t return a single ultra-generic word when we can avoid it
  if (/^(candy|crackers?|chips?)$/i.test(out.trim()) && firstChunk.trim()) {
    // fallback to something more descriptive from the chunk
    const w = firstChunk.trim().split(" ").filter(Boolean);
    if (w.length >= 2) out = capitalize(w.slice(0, Math.min(5, w.length)).join(" "));
    if (keptBrand && !out.toLowerCase().startsWith(keptBrand.toLowerCase()))
      out = `${keptBrand} ${out}`.trim();
    if (hasGF && !/gluten[-\s]?free/i.test(out)) out = `${out} — Gluten Free`;
  }

  return out.trim();
}

function escapeRegExp(v: string) {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalize(v: string) {
  if (!v) return v;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/* =========================================================
   Small helpers
========================================================= */

function uid(prefix = "r") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysYMD(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function defaultUseByForLocation(storedOn: string, loc: Location | null) {
  const days =
    loc === "Leftovers"
      ? 5
      : loc === "Fridge"
        ? 14
        : loc === "Freezer"
          ? 365
          : 180;
  return addDaysYMD(storedOn, days);
}

function safeString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function coerceQty(v: unknown, fallback = 1) {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(1, Math.floor(v));
  if (typeof v === "string") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return Math.max(1, Math.floor(n));
  }
  return fallback;
}

/* =========================================================
   Component
========================================================= */

type Mode = "type" | "paste" | "upload";

export default function ReceiptScanTool({
  onDone,
  forcedMode,
  embedded = false,
}: {
  onDone?: () => void;
  forcedMode?: Mode;
  embedded?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(forcedMode ?? "paste");
  const activeMode: Mode = forcedMode ?? mode;

  const [typeText, setTypeText] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const [loadingStorage, setLoadingStorage] = useState(true);
  const [storageItems, setStorageItems] = useState<StorageItem[]>([]);
  const [rows, setRows] = useState<ReceiptRow[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");

  useEffect(() => {
    if (!forcedMode) return;
    setMode(forcedMode);
    setError("");
    setNotice("");
  }, [forcedMode]);

  useEffect(() => {
    let alive = true;

    async function loadStorage() {
      setLoadingStorage(true);
      try {
        const res = await fetch("/api/storage-items", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Failed to load storage items");
        if (!alive) return;
        setStorageItems(Array.isArray(json?.items) ? (json.items as StorageItem[]) : []);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Failed to load storage items");
        setStorageItems([]);
      } finally {
        if (!alive) return;
        setLoadingStorage(false);
      }
    }

    loadStorage();
    return () => {
      alive = false;
    };
  }, []);

  const matchIndex = useMemo(() => {
    try {
      return buildStorageMatchIndex(storageItems || []);
    } catch {
      return buildStorageMatchIndex([]);
    }
  }, [storageItems]);

  const checkedCount = rows.filter((r) => r.checked).length;

  const duplicateSummary = useMemo(() => {
    const groups = new Map<string, ReceiptRow[]>();
    for (const r of rows) {
      if (!r.dupGroupKey) continue;
      groups.set(r.dupGroupKey, [...(groups.get(r.dupGroupKey) || []), r]);
    }
    const groupCount = Array.from(groups.keys()).length;
    const extraCount = Array.from(groups.values()).reduce(
      (sum, g) => sum + Math.max(0, g.length - 1),
      0
    );
    return { groupCount, extraCount };
  }, [rows]);

  function clearAll() {
    setError("");
    setNotice("");
    setRows([]);
    setTypeText("");
    setPasteText("");
    setFiles([]);
  }

  function setRow(id: string, patch: Partial<ReceiptRow>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;

        const next: ReceiptRow = { ...r, ...patch };

        const storedOn = next.stored_on || todayYMD();
        if (
          (patch.location !== undefined || patch.stored_on !== undefined) &&
          !next.useByTouched
        ) {
          next.stored_on = storedOn;
          next.use_by = defaultUseByForLocation(storedOn, next.location);
        }

        return next;
      })
    );
  }

  function recomputeDupKeys(base: ReceiptRow[]) {
    const map = new Map<string, number>();
    for (const r of base) {
      const k = r.canonLoose || "";
      if (!k) continue;
      map.set(k, (map.get(k) || 0) + 1);
    }

    return base.map((r) => {
      const count = r.canonLoose ? map.get(r.canonLoose) || 0 : 0;
      return {
        ...r,
        dupGroupKey: count >= 2 ? r.canonLoose : null,
      };
    });
  }

  function computeMatchPreview(name: string, unit: string | null) {
    const cleaned = normalizePurchaseItemName(name || "");
    const canonLoose = canonicalizeLoose(cleaned);
    const canonStrict = canonicalizeStrict(cleaned);

    const matched = matchToStorage(matchIndex, cleaned);
    const list: StorageItem[] = Array.isArray((matched as any)?.items)
      ? ((matched as any).items as StorageItem[])
      : Array.isArray(matched)
        ? (matched as StorageItem[])
        : [];

    const kind: MatchKind | null = (matched as any)?.kind ?? null;

    let label: string | null = null;
    if (list.length > 0) {
      const first = list[0];
      const loc = safeString((first as any)?.location) || "Somewhere";
      label = `${loc}${typeof (first as any)?.quantity === "number" ? ` • ${(first as any).quantity}` : ""}${
        safeString((first as any)?.unit) ? ` ${(first as any).unit}` : ""
      }`;
    }

    if (list.length > 0 && unit) {
      const anyCompatible = list.some((s) => unitsCompatible(unit, safeString((s as any)?.unit)));
      if (!anyCompatible) label = label ? `${label} • (unit differs)` : "(unit differs)";
    }

    return {
      canonLoose,
      canonStrict,
      matchKind: kind,
      matchedStorage: list.slice(0, 4),
      matchLabel: label,
    };
  }

  function buildRowsFromSimpleLines(raw: string) {
    const storedOn = todayYMD();
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const baseRows: ReceiptRow[] = lines
      .map((line) => {
        const m = line.match(/^(.*?)(?:\s+x?\s*(\d+))?$/i);
        const rawName = (m?.[1] ?? line).trim();
        const qty = m?.[2] ? coerceQty(m[2], 1) : 1;

        const name = normalizePurchaseItemName(rawName);
        if (!name) return null;

        const match = computeMatchPreview(name, null);

        const row: ReceiptRow = {
          id: uid("row"),
          checked: true,
          name,
          quantity: qty,
          unit: null,
          location: "Pantry",
          stored_on: storedOn,
          use_by: defaultUseByForLocation(storedOn, "Pantry"),
          notes: "",

          canonLoose: match.canonLoose,
          canonStrict: match.canonStrict,
          dupGroupKey: null,

          matchKind: match.matchKind,
          matchedStorage: match.matchedStorage,
          matchLabel: match.matchLabel,

          useByTouched: false,
        };

        return row;
      })
      .filter(Boolean) as ReceiptRow[];

    setRows(recomputeDupKeys(baseRows));
  }

  async function runParse() {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      let data: ReceiptParseResponse | null = null;

      if (activeMode === "paste") {
        const text = pasteText.trim();
        if (!text) {
          setError("Paste something first.");
          setBusy(false);
          return;
        }

        const res = await fetch("/api/receipt/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        data = (await res.json().catch(() => null)) as ReceiptParseResponse | null;

        if (!res.ok) {
          const msg =
            data?.error || `Receipt parse failed (${res.status} ${res.statusText || "error"})`;
          throw new Error(msg);
        }
      }

      if (activeMode === "upload") {
        if (files.length === 0) {
          setError("Upload a file first.");
          setBusy(false);
          return;
        }

        const fd = new FormData();
        for (const f of files) fd.append("files", f);

        const res = await fetch("/api/receipt/parse", { method: "POST", body: fd });
        data = (await res.json().catch(() => null)) as ReceiptParseResponse | null;

        if (!res.ok) {
          const msg =
            data?.error || `Receipt parse failed (${res.status} ${res.statusText || "error"})`;
          throw new Error(msg);
        }
      }

      const items = Array.isArray(data?.items) ? (data!.items as ParsedReceiptItem[]) : [];

      if (items.length === 0) {
        const msg = typeof data?.message === "string" ? data.message.trim() : "";
        if (msg) setNotice(msg);
        setRows([]);
        return;
      }

      const storedOn = todayYMD();

      const baseRows: ReceiptRow[] = items
        .map((it) => {
          const rawName = safeString(it?.name);
          const name = normalizePurchaseItemName(rawName);
          if (!name) return null;

          const quantity = coerceQty(it?.quantity, 1);
          const unit = safeString(it?.unit) ? safeString(it?.unit) : null;
          const notes = safeString(it?.notes);

          const match = computeMatchPreview(name, unit);

          const row: ReceiptRow = {
            id: uid("row"),
            checked: true,

            name,
            quantity,
            unit,
            location: "Pantry",
            stored_on: storedOn,
            use_by: defaultUseByForLocation(storedOn, "Pantry"),
            notes,

            canonLoose: match.canonLoose,
            canonStrict: match.canonStrict,
            dupGroupKey: null,

            matchKind: match.matchKind,
            matchedStorage: match.matchedStorage,
            matchLabel: match.matchLabel,

            useByTouched: false,
          };

          return row;
        })
        .filter(Boolean) as ReceiptRow[];

      setRows(recomputeDupKeys(baseRows));
    } catch (e: any) {
      setError(e?.message || "Receipt parse failed");
    } finally {
      setBusy(false);
    }
  }

  async function addSelectedToStorage() {
    const selected = rows.filter((r) => r.checked && r.name.trim());
    if (selected.length === 0) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const results = await Promise.all(
        selected.map(async (r) => {
          const payload = {
            name: r.name.trim(),
            location: r.location,
            quantity: r.quantity,
            unit: r.unit,
            stored_on: r.stored_on,
            use_by: r.use_by,
            notes: r.notes?.trim() || null,
          };

          const res = await fetch("/api/storage-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          const json = await res.json().catch(() => null);
          return { ok: res.ok, error: json?.error };
        })
      );

      const failures = results.filter((x) => !x.ok);
      if (failures.length > 0)
        throw new Error(failures[0].error || `Failed to add ${failures.length} item(s)`);

      clearAll();
      onDone?.();
    } catch (e: any) {
      setError(e?.message || "Add failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleAll(next: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, checked: next })));
  }

  function onFilesPicked(list: FileList | null) {
    if (!list) return;
    setFiles(Array.from(list));
  }

  useEffect(() => {
    if (rows.length === 0) return;

    setRows((prev) => {
      const refreshed = prev.map((r) => {
        const match = computeMatchPreview(r.name, r.unit);
        return {
          ...r,
          canonLoose: match.canonLoose,
          canonStrict: match.canonStrict,
          matchKind: match.matchKind,
          matchedStorage: match.matchedStorage,
          matchLabel: match.matchLabel,
        };
      });
      return recomputeDupKeys(refreshed);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchIndex]);

  const btn =
    "rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2.5 text-sm font-semibold ring-1 ring-white/10 transition disabled:opacity-50";
  const btnPrimary =
    "rounded-2xl bg-fuchsia-500 hover:bg-fuchsia-400 px-4 py-2.5 text-sm font-extrabold text-black shadow-lg shadow-fuchsia-500/20 transition disabled:opacity-50";

  const primaryLabel =
    activeMode === "type"
      ? "Conjure items"
      : activeMode === "paste"
        ? "Summon the chaos"
        : "Crack it open";

  return (
    <div className="text-white">
      {notice ? (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {activeMode === "type" ? (
        <>
          <div className="text-sm font-semibold text-white/85">Type items (one per line)</div>
          <div className="mt-2 text-xs text-white/55">Tip: you can do “kale 2” or “kale x2”.</div>
          <textarea
            value={typeText}
            onChange={(e) => setTypeText(e.target.value)}
            placeholder={`milk\nbananas 6\nfrozen pizza x2`}
            className="mt-3 w-full min-h-[160px] rounded-2xl bg-white/5 text-white placeholder:text-white/35 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
          />
        </>
      ) : activeMode === "paste" ? (
        <>
          <div className="text-sm font-semibold text-white/85">Paste receipt text</div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste receipt text here…"
            className="mt-3 w-full min-h-[160px] rounded-2xl bg-white/5 text-white placeholder:text-white/35 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
          />
        </>
      ) : (
        <>
          <div className="text-sm font-semibold text-white/85">Upload a receipt file</div>
          <div className="mt-2 text-xs text-white/55">
            Accepts any file type. (If it’s a scanned PDF/image, you’ll still need OCR for best results.)
          </div>
          <input
            type="file"
            multiple
            accept="*/*"
            onChange={(e) => onFilesPicked(e.target.files)}
            className="mt-3 block w-full text-sm text-white/70 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
          />
          {files.length > 0 ? (
            <div className="mt-2 text-xs text-white/55">
              {files.length} file(s):{" "}
              <span className="text-white/75">
                {files.map((f) => f.name).slice(0, 3).join(", ")}
                {files.length > 3 ? "…" : ""}
              </span>
            </div>
          ) : null}
        </>
      )}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          className={btnPrimary}
          disabled={busy}
          onClick={() => {
            if (activeMode === "type") {
              if (!typeText.trim()) {
                setError("Type something first.");
                return;
              }
              setError("");
              setNotice("");
              buildRowsFromSimpleLines(typeText);
              return;
            }
            runParse();
          }}
        >
          {busy ? "Working…" : primaryLabel}
        </button>

        <button type="button" className={btn} onClick={clearAll} disabled={busy}>
          Wipe it
        </button>
      </div>

      {rows.length > 0 ? (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-white/70">
              {checkedCount} selected • {rows.length} total
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" className={btn} onClick={() => toggleAll(true)} disabled={busy}>
                Select all
              </button>
              <button type="button" className={btn} onClick={() => toggleAll(false)} disabled={busy}>
                Select none
              </button>
              <button
                type="button"
                className={btnPrimary}
                onClick={addSelectedToStorage}
                disabled={busy || checkedCount === 0}
              >
                Add to the Chaos
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {rows.map((r) => {
              const isDup = Boolean(r.dupGroupKey);

              return (
                <div
                  key={r.id}
                  className={`rounded-3xl ring-1 p-4 ${
                    isDup ? "bg-fuchsia-500/10 ring-fuchsia-400/25" : "bg-white/5 ring-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0">
                      <label className="mt-1 flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={r.checked}
                          onChange={() => setRow(r.id, { checked: !r.checked })}
                          className="h-4 w-4 accent-fuchsia-500"
                        />
                      </label>

                      <div className="min-w-0">
                        <input
                          value={r.name}
                          onChange={(e) => setRow(r.id, { name: e.target.value })}
                          className="w-[520px] max-w-[80vw] rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                        />
                        {r.matchLabel ? (
                          <div className="mt-1 text-xs text-white/45">
                            Match: <span className="text-white/65">{r.matchLabel}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="number"
                        min={1}
                        value={r.quantity}
                        onChange={(e) => setRow(r.id, { quantity: coerceQty(e.target.value, 1) })}
                        className="w-[90px] rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                      />

                      <select
                        value={r.location ?? "Pantry"}
                        onChange={(e) => setRow(r.id, { location: e.target.value as Location })}
                        className="w-[160px] rounded-2xl bg-[#0b1026] text-white ring-1 ring-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                      >
                        <option value="Pantry">Pantry</option>
                        <option value="Fridge">Fridge</option>
                        <option value="Freezer">Freezer</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-3">
                    <input
                      value={r.notes}
                      onChange={(e) => setRow(r.id, { notes: e.target.value })}
                      placeholder="Optional notes (e.g., theirs, keep separate, etc.)"
                      className="w-full rounded-2xl bg-white/5 text-white placeholder:text-white/35 ring-1 ring-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
