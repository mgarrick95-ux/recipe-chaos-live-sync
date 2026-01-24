// components/frostpantry/ReceiptScanTool.tsx
"use client";

import type React from "react";
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
};

type ReceiptRow = {
  id: string;

  // user-facing fields
  checked: boolean;
  name: string;
  quantity: number;
  unit: string | null;
  location: Location | null;
  stored_on: string | null; // YYYY-MM-DD
  use_by: string | null; // YYYY-MM-DD
  notes: string;

  // matching / duplicate signals
  canonLoose: string;
  canonStrict: string;
  dupGroupKey: string | null;
  matchKind: MatchKind | null;
  matchedStorage: StorageItem[]; // preview matches (0..n)
  matchLabel: string | null;

  // "don’t surprise me" latches
  useByTouched: boolean;
};

/* =========================================================
   Name normalization (same style as AddFromPurchaseInline)
========================================================= */

function normalizePurchaseItemName(raw: string) {
  let s = cleanName(raw || "");
  if (!s) return s;

  const trimTail = (v: string) => v.replace(/[,\-–—:\s]+$/g, "").trim();

  s = s.replace(
    /\s*,?\s*sold in\s+(singles?|each|bulk|bunch(es)?|bags?)\b.*$/i,
    ""
  );
  s = trimTail(s);

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

  s = s.replace(
    /\s*,?\s*\d+(\.\d+)?\s*[x×]\s*\d*(\.\d+)?\s*(kg|g|lb|lbs|oz|ml|l|liters?|litres?)\b\.?\s*$/i,
    ""
  );
  s = trimTail(s);

  s = s.replace(/\s*,?\s*\d+\s*(pack|pk|ct|count)\b\.?\s*$/i, "");
  s = trimTail(s);

  s = s.replace(/\s*,?\s*\d+\s*[x×]\s*$/i, "");
  s = trimTail(s);

  s = s.replace(
    /\s*,?\s*(prepared in|made in|product of|imported)\b[^,]*$/i,
    ""
  );
  s = trimTail(s);

  // trailing “, 1.5” style fragments
  if (/(,|\s)\d+(\.\d+)?\s*$/.test(s) && /[a-zA-Z]/.test(s)) {
    s = s.replace(/\s*,?\s*\d+(\.\d+)?\s*$/i, "");
    s = trimTail(s);
  }

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

  if (/\(\s*\d+[^)]*\)\s*$/i.test(s)) {
    s = s.replace(/\s*\(\s*\d+[^)]*\)\s*$/i, "");
    s = trimTail(s);
  }

  return s || cleanName(raw || "");
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
  // Calm defaults. User can always override.
  // (If you already have server-side logic, this just helps the UI feel consistent.)
  const days =
    loc === "Leftovers"
      ? 5
      : loc === "Fridge"
        ? 14
        : loc === "Freezer"
          ? 365
          : 180; // Pantry/unknown
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

export default function ReceiptScanTool({ onDone }: { onDone?: () => void }) {
  const [mode, setMode] = useState<"paste" | "photos">("paste");

  // input state
  const [pasteText, setPasteText] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  // data state
  const [loadingStorage, setLoadingStorage] = useState(true);
  const [storageItems, setStorageItems] = useState<StorageItem[]>([]);
  const [rows, setRows] = useState<ReceiptRow[]>([]);

  // ui state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  // load storage for match previews
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

  // Duplicate summary banner (visibility only; never merges)
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

  const anyRows = rows.length > 0;
  const checkedCount = rows.filter((r) => r.checked).length;

  function clearAll() {
    setError("");
    setRows([]);
    setPasteText("");
    setFiles([]);
  }

  function setRow(id: string, patch: Partial<ReceiptRow>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;

        const next: ReceiptRow = { ...r, ...patch };

        // If location or stored_on changes and user hasn't touched use_by, keep it helpful.
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
    // Group by a loose canonical key, but only if it’s meaningful
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
    // matchToStorage can be designed different ways; handle both:
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

    // unit compatibility note (light touch)
    if (list.length > 0 && unit) {
      const anyCompatible = list.some((s) => unitsCompatible(unit, safeString((s as any)?.unit)));
      if (!anyCompatible) {
        label = label ? `${label} • (unit differs)` : "(unit differs)";
      }
    }

    return { canonLoose, canonStrict, matchKind: kind, matchedStorage: list.slice(0, 4), matchLabel: label };
  }

  async function parseReceipt() {
    setBusy(true);
    setError("");

    try {
      let data: ReceiptParseResponse | null = null;

      if (mode === "paste") {
        const text = pasteText.trim();
        if (!text) {
          setError("Paste receipt text first.");
          setBusy(false);
          return;
        }

        const res = await fetch("/api/receipt/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        data = (await res.json().catch(() => null)) as ReceiptParseResponse | null;
        if (!res.ok) throw new Error(data?.error || "Receipt parse failed");
      } else {
        if (files.length === 0) {
          setError("Add one or more images first.");
          setBusy(false);
          return;
        }

        const fd = new FormData();
        for (const f of files) fd.append("files", f);

        const res = await fetch("/api/receipt/parse", {
          method: "POST",
          body: fd,
        });

        data = (await res.json().catch(() => null)) as ReceiptParseResponse | null;
        if (!res.ok) throw new Error(data?.error || "Receipt parse failed");
      }

      const items = Array.isArray(data?.items) ? (data!.items as ParsedReceiptItem[]) : [];
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
      setError(e?.message || "Parse failed");
    } finally {
      setBusy(false);
    }
  }

  async function addSelectedToStorage() {
    const selected = rows.filter((r) => r.checked && r.name.trim());
    if (selected.length === 0) return;

    setBusy(true);
    setError("");

    try {
      // optimistic: add one-by-one; keeps it compatible with simple APIs
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
      if (failures.length > 0) {
        throw new Error(failures[0].error || `Failed to add ${failures.length} item(s)`);
      }

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
    const next = Array.from(list);
    setFiles(next);
  }

  // Recompute match previews if storage changes (quietly)
  useEffect(() => {
    if (!anyRows) return;

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
    "rounded-2xl bg-fuchsia-500 hover:bg-fuchsia-400 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-fuchsia-500/20 transition disabled:opacity-50";

  return (
    <div className="text-white">
      {/* Mode pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          className={btn}
          onClick={() => setMode("paste")}
          aria-pressed={mode === "paste"}
          title="Paste receipt text (fastest, most reliable)"
        >
          Paste text
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => setMode("photos")}
          aria-pressed={mode === "photos"}
          title="Upload one or more receipt images"
        >
          Photos
        </button>

        <div className="text-xs text-white/55 ml-1">
          Review-first. Nothing is merged or added without a click.
        </div>
      </div>

      {/* Input card */}
      <div className="mt-4 rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
        {error ? (
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {loadingStorage ? (
          <div className="text-sm text-white/60">Loading storage for match previews…</div>
        ) : null}

        {mode === "paste" ? (
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
            <div className="text-sm font-semibold text-white/85">Upload receipt photos</div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onFilesPicked(e.target.files)}
              className="mt-3 block w-full text-sm text-white/70 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
            />
            {files.length > 0 ? (
              <div className="mt-2 text-xs text-white/55">{files.length} file(s) selected.</div>
            ) : null}
          </>
        )}

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <button type="button" className={btnPrimary} onClick={parseReceipt} disabled={busy}>
            {busy ? "Working…" : "Parse"}
          </button>
          <button type="button" className={btn} onClick={clearAll} disabled={busy}>
            Clear
          </button>
        </div>
      </div>

      {/* Results */}
      {anyRows ? (
        <div className="mt-6">
          {/* Duplicates banner (visibility only) */}
          {duplicateSummary.groupCount > 0 ? (
            <div className="mb-4 rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
              <div className="font-semibold text-white/90">Possible duplicates on this receipt</div>
              <div className="mt-1 text-sm text-white/60">
                {duplicateSummary.groupCount} group{duplicateSummary.groupCount === 1 ? "" : "s"} found
                {duplicateSummary.extraCount > 0 ? ` (${duplicateSummary.extraCount} extra line${duplicateSummary.extraCount === 1 ? "" : "s"})` : ""}.
                We won’t merge anything automatically.
              </div>
            </div>
          ) : null}

          {/* Actions */}
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
                title="Adds selected items to Pantry & Freezer"
              >
                Add selected to the Chaos
              </button>
            </div>
          </div>

          {/* Rows */}
          <div className="grid gap-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4"
                style={
                  r.dupGroupKey
                    ? {
                        border: "1px solid rgba(232,121,249,0.25)",
                        background: "rgba(232,121,249,0.06)",
                      }
                    : undefined
                }
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={r.checked}
                    onChange={(e) => setRow(r.id, { checked: e.target.checked })}
                    className="mt-1 h-5 w-5 accent-fuchsia-500"
                    aria-label={`Select ${r.name}`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        value={r.name}
                        onChange={(e) => setRow(r.id, { name: e.target.value })}
                        className="w-full md:flex-1 rounded-2xl bg-white/5 text-white placeholder:text-white/35 ring-1 ring-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                        placeholder="Item name"
                      />

                      <input
                        value={String(r.quantity)}
                        onChange={(e) => setRow(r.id, { quantity: coerceQty(e.target.value, 1) })}
                        className="w-20 rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                        inputMode="numeric"
                        aria-label="Quantity"
                        title="Quantity"
                      />

                      <input
                        value={r.unit ?? ""}
                        onChange={(e) => setRow(r.id, { unit: e.target.value.trim() || null })}
                        className="w-28 rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                        placeholder="unit"
                        aria-label="Unit"
                        title="Unit (optional)"
                      />
                    </div>

                    <div className="mt-2 grid gap-2 md:grid-cols-4">
                      <select
                        value={(r.location ?? "Pantry") as any}
                        onChange={(e) => setRow(r.id, { location: e.target.value as Location })}
                        className="rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                        aria-label="Location"
                        title="Location"
                      >
                        <option value="Pantry">Pantry</option>
                        <option value="Fridge">Fridge</option>
                        <option value="Freezer">Freezer</option>
                        <option value="Leftovers">Leftovers</option>
                      </select>

                      <div className="flex flex-col">
                        <label className="text-[11px] text-white/45 mb-1">Stored on</label>
                        <input
                          type="date"
                          value={r.stored_on ?? ""}
                          onChange={(e) => setRow(r.id, { stored_on: e.target.value || null })}
                          className="rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                        />
                      </div>

                      <div className="flex flex-col md:col-span-2">
                        <label className="text-[11px] text-white/45 mb-1">Use by</label>
                        <input
                          type="date"
                          value={r.use_by ?? ""}
                          onChange={(e) =>
                            setRow(r.id, { use_by: e.target.value || null, useByTouched: true })
                          }
                          className="rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                        />
                      </div>
                    </div>

                    {r.matchLabel ? (
                      <div className="mt-2 text-xs text-white/55">
                        In storage: <span className="text-white/75 font-semibold">{r.matchLabel}</span>
                      </div>
                    ) : null}

                    <textarea
                      value={r.notes}
                      onChange={(e) => setRow(r.id, { notes: e.target.value })}
                      placeholder="Notes (prices / discounts / receipt junk can live here)"
                      className="mt-3 w-full rounded-2xl bg-white/5 text-white placeholder:text-white/35 ring-1 ring-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 text-xs text-white/55">
            Duplicates are highlighted for visibility only — no automatic merging or quantity changes.
          </div>
        </div>
      ) : null}
    </div>
  );
}
