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

  useEffect(() => {
    if (!forcedMode) return;
    setMode(forcedMode);
    setError("");
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
      label = `${loc}${
        typeof (first as any)?.quantity === "number" ? ` • ${(first as any).quantity}` : ""
      }${safeString((first as any)?.unit) ? ` ${(first as any).unit}` : ""}`;
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
            data?.error ||
            `Receipt parse failed (${res.status} ${res.statusText || "error"})`;
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
            data?.error ||
            `Receipt parse failed (${res.status} ${res.statusText || "error"})`;
          throw new Error(msg);
        }
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
      {!embedded ? (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-3xl font-extrabold tracking-tight">Receipt</div>
            <div className="mt-2 text-white/70">
              Type items, paste receipt text, or upload a file. Review first. Add only what you want.
            </div>
            {loadingStorage ? (
              <div className="mt-2 text-xs text-white/50">Loading storage for match previews…</div>
            ) : null}
          </div>
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
          {duplicateSummary.groupCount > 0 ? (
            <div className="mb-4 rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
              <div className="font-semibold text-white/90">Possible duplicates</div>
              <div className="mt-1 text-sm text-white/60">
                {duplicateSummary.groupCount} group{duplicateSummary.groupCount === 1 ? "" : "s"} found
                {duplicateSummary.extraCount > 0
                  ? ` (${duplicateSummary.extraCount} extra line${duplicateSummary.extraCount === 1 ? "" : "s"})`
                  : ""}
                . No automatic merging.
              </div>
            </div>
          ) : null}

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

          <div className="text-xs text-white/55">
            Duplicates are highlighted for visibility only — no automatic merging or quantity changes.
          </div>
        </div>
      ) : null}
    </div>
  );
}
