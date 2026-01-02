// app/frostpantry/page.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RcPageShell from "@/components/rc/RcPageShell";

/* =========================
   Types
========================= */

type Location = "Freezer" | "Fridge" | "Pantry";

type StorageItem = {
  id: string;
  name: string;
  location: Location;
  quantity: number;
  unit: string;
  is_leftover: boolean;
  stored_on: string | null;
  use_by: string | null;
  notes: string | null;
  created_at: string;
};

type FilterTab = "all" | "leftovers" | "soonish" | "expired" | "freezer" | "fridge" | "pantry";

/* =========================
   Constants
========================= */

// Use Soon-ish (Option C locked)
const SOONISH_LIMIT_MAIN = 3;

const SOONISH_BY_LOCATION: Record<Location, number> = {
  Pantry: 0, // you wanted essentially “don’t nag pantry”
  Fridge: 2,
  Freezer: 5,
};

const SOONISH_LEFTOVER_DAYS = 3;

// Default use-by windows (locked earlier)
const DEFAULT_DAYS_BY_LOCATION: Record<Location, number> = {
  Fridge: 30,
  Pantry: 180,
  Freezer: 180,
};

/* =========================
   Date helpers
========================= */

function todayAsDateInput() {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysISO(yyyyMmDd: string, days: number) {
  const d = new Date(yyyyMmDd);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function prettyDateShort(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* =========================
   Logic helpers
========================= */

function isOut(item: StorageItem) {
  return (item.quantity ?? 0) === 0;
}

function isLow(item: StorageItem) {
  return (item.quantity ?? 0) === 1;
}

function isExpired(item: StorageItem) {
  if (isOut(item)) return false;
  const d = daysUntil(item.use_by);
  return d != null && d < 0;
}

function isSoonish(item: StorageItem) {
  if (isOut(item)) return false;
  if (isExpired(item)) return false;

  const d = daysUntil(item.use_by);
  if (d == null) return false;

  // leftovers have their own tighter window
  if (item.is_leftover) return d <= SOONISH_LEFTOVER_DAYS;

  return d <= SOONISH_BY_LOCATION[item.location];
}

function computeDefaultUseBy(location: Location, stored_on: string, currentUseBy: string, useByAuto: boolean) {
  const canAutoSet = currentUseBy.trim() === "" || useByAuto;
  if (!stored_on || !canAutoSet) return { use_by: currentUseBy, useByAuto };

  const days = DEFAULT_DAYS_BY_LOCATION[location];
  return { use_by: addDaysISO(stored_on, days), useByAuto: true };
}

/* =========================
   Chip
========================= */

function Chip({
  text,
  tone = "default",
}: {
  text: string;
  tone?: "default" | "low" | "out" | "expired";
}) {
  const styles: Record<string, React.CSSProperties> = {
    default: {
      borderColor: "rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.92)",
    },
    low: {
      background: "rgba(56,189,248,0.12)",
      borderColor: "rgba(56,189,248,0.35)",
      color: "rgba(255,255,255,0.92)",
    },
    out: {
      background: "rgba(251,146,60,0.12)",
      borderColor: "rgba(251,146,60,0.4)",
      color: "rgba(255,255,255,0.92)",
    },
    expired: {
      background: "rgba(239,68,68,0.12)",
      borderColor: "rgba(239,68,68,0.4)",
      color: "rgba(255,255,255,0.92)",
    },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        border: "1px solid",
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 750,
        lineHeight: 1,
        ...styles[tone],
      }}
    >
      {text}
    </span>
  );
}

/* =========================
   Page
========================= */

export default function FrostPantryPage() {
  // 🔥 Helpful while iterating; remove later if you want.
  // eslint-disable-next-line no-console
  console.log("🔥 FROSTPANTRY PAGE — LOADED", new Date().toISOString());

  const router = useRouter();

  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Inline Add panel (you asked: not a new page)
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addLocation, setAddLocation] = useState<Location>("Freezer");
  const [addQty, setAddQty] = useState<number>(1);
  const [addUnit, setAddUnit] = useState("bag");

  const [addStoredOn, setAddStoredOn] = useState<string>(() => todayAsDateInput());
  const [addUseBy, setAddUseBy] = useState<string>("");
  const [addUseByAuto, setAddUseByAuto] = useState<boolean>(true);
  const [addBusy, setAddBusy] = useState(false);

  async function loadItems() {
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/storage-items", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load items");
      setItems((json.items ?? []) as StorageItem[]);
    } catch (e: any) {
      console.error(e);
      setItems([]);
      setErrorMsg(e?.message ?? "Failed to load Pantry & Freezer");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  // Keep selection sane if items refresh
  useEffect(() => {
    if (selectedIds.length === 0) return;
    const existing = new Set(items.map((i) => i.id));
    setSelectedIds((prev) => prev.filter((id) => existing.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Keep Add “use by” in sync while still auto
  useEffect(() => {
    if (!addOpen) return;
    const computed = computeDefaultUseBy(addLocation, addStoredOn, addUseBy, addUseByAuto);
    if (computed.use_by !== addUseBy) setAddUseBy(computed.use_by);
    if (computed.useByAuto !== addUseByAuto) setAddUseByAuto(computed.useByAuto);
  }, [addOpen, addLocation, addStoredOn, addUseBy, addUseByAuto]);

  /* =========================
     Derived lists
  ========================= */

  const soonishAll = useMemo(() => items.filter(isSoonish), [items]);
  const soonishMain = useMemo(() => soonishAll.slice(0, SOONISH_LIMIT_MAIN), [soonishAll]);
  const soonishRemaining = Math.max(0, soonishAll.length - soonishMain.length);

  const expiredItems = useMemo(() => items.filter(isExpired), [items]);

  const filtered = useMemo(() => {
    switch (activeFilter) {
      case "soonish":
        return soonishAll;
      case "expired":
        return expiredItems;
      case "leftovers":
        return items.filter((i) => i.is_leftover);
      case "freezer":
        return items.filter((i) => i.location === "Freezer");
      case "fridge":
        return items.filter((i) => i.location === "Fridge");
      case "pantry":
        return items.filter((i) => i.location === "Pantry");
      default:
        return items;
    }
  }, [items, activeFilter, soonishAll, expiredItems]);

  const filteredIds = useMemo(() => filtered.map((i) => i.id), [filtered]);
  const selectionCount = selectedIds.length;

  const selectedAllFiltered = useMemo(() => {
    if (filteredIds.length === 0) return false;
    for (const id of filteredIds) if (!selectedSet.has(id)) return false;
    return true;
  }, [filteredIds, selectedSet]);

  /* =========================
     Actions
  ========================= */

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const prevSet = new Set(prev);
      if (selectedAllFiltered) return prev.filter((id) => !filteredIds.includes(id));
      for (const id of filteredIds) prevSet.add(id);
      return Array.from(prevSet);
    });
  }

  async function changeQuantity(id: string, delta: number) {
    const target = items.find((i) => i.id === id);
    if (!target) return;

    const nextQty = Math.max(0, (Number(target.quantity) || 0) + delta);
    if (nextQty === target.quantity) return;

    setBusyId(id);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/storage-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: nextQty }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.ok === false)) throw new Error(json?.error || "Failed to update quantity");

      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: nextQty } : i)));
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Failed to update quantity");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteItem(id: string) {
    const ok = confirm("Delete this item from Pantry & Freezer?");
    if (!ok) return;

    setBusyId(id);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/storage-items/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.ok === false)) throw new Error(json?.error || "Failed to delete item");

      setItems((prev) => prev.filter((i) => i.id !== id));
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Failed to delete item");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteSelected() {
    if (selectionCount === 0) return;

    const ok = confirm(`Delete ${selectionCount} selected item${selectionCount === 1 ? "" : "s"}?`);
    if (!ok) return;

    setBulkBusy(true);
    setErrorMsg("");

    const ids = [...selectedIds];

    try {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const res = await fetch(`/api/storage-items/${id}`, { method: "DELETE" });
          const json = await res.json().catch(() => null);
          if (!res.ok || (json && json.ok === false)) throw new Error(json?.error || `Failed to delete ${id}`);
          return id;
        })
      );

      const succeeded: string[] = [];
      const failed: string[] = [];

      for (const r of results) {
        if (r.status === "fulfilled") succeeded.push(r.value);
        else failed.push(String((r as any).reason?.message || "unknown error"));
      }

      if (succeeded.length > 0) {
        setItems((prev) => prev.filter((i) => !succeeded.includes(i.id)));
        setSelectedIds((prev) => prev.filter((id) => !succeeded.includes(id)));
      }

      if (failed.length > 0) {
        setErrorMsg(`Some deletes failed: ${failed.slice(0, 3).join(" • ")}${failed.length > 3 ? " …" : ""}`);
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Bulk delete failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;

    setErrorMsg("");
    setAddBusy(true);

    try {
      const res = await fetch("/api/storage-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName.trim(),
          location: addLocation,
          quantity: addQty || 1,
          unit: addUnit.trim() || "unit",
          stored_on: addStoredOn || null,
          use_by: addUseBy.trim() ? addUseBy.trim() : null,
          is_leftover: false,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.ok === false)) throw new Error(json?.error || "Failed to add item");

      await loadItems();

      // Reset form to “ready again”
      setAddName("");
      setAddQty(1);
      setAddUnit("bag");
      const nextStored = todayAsDateInput();
      setAddStoredOn(nextStored);

      const computed = computeDefaultUseBy(addLocation, nextStored, "", true);
      setAddUseBy(computed.use_by);
      setAddUseByAuto(computed.useByAuto);

      setAddOpen(false);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Failed to add item");
    } finally {
      setAddBusy(false);
    }
  }

  /* =========================
     Header
  ========================= */

  const tabPill =
    "group relative inline-flex items-center gap-3 rounded-full bg-white/10 hover:bg-white/15 px-5 py-3 text-sm font-semibold ring-1 ring-white/10 transition";
  const tabPillActive =
    "group relative inline-flex items-center gap-3 rounded-full bg-fuchsia-500/80 hover:bg-fuchsia-500 px-5 py-3 text-sm font-extrabold text-white ring-1 ring-white/10 transition";

  const headerBtn =
    "rounded-full bg-white/10 hover:bg-white/15 px-5 py-3 text-sm font-semibold ring-1 ring-white/10 transition";

  const header = (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-6xl font-extrabold tracking-tight">
          Pantry &amp; Freezer{" "}
          <span className="inline-block align-middle ml-2 h-3 w-3 rounded-full bg-fuchsia-400 shadow-[0_0_30px_rgba(232,121,249,0.35)]" />
        </h1>

        <p className="mt-3 text-white/75 text-lg">What’s around, more or less.</p>

        <div className="mt-3 text-white/50 text-sm">
          <span className="text-white/40">Recipes link:</span>{" "}
          <Link href="/recipes" className="underline underline-offset-4 text-white/70 hover:text-white">
            Recipes
          </Link>
        </div>

        <div className="mt-6 flex items-center gap-2 flex-wrap">
          <FilterPill label="All" active={activeFilter === "all"} onClick={() => setActiveFilter("all")} />
          <FilterPill label="Use Soon-ish" active={activeFilter === "soonish"} onClick={() => setActiveFilter("soonish")} />
          <FilterPill label="Leftovers" active={activeFilter === "leftovers"} onClick={() => setActiveFilter("leftovers")} />
          <FilterPill label="Freezer" active={activeFilter === "freezer"} onClick={() => setActiveFilter("freezer")} />
          <FilterPill label="Fridge" active={activeFilter === "fridge"} onClick={() => setActiveFilter("fridge")} />
          <FilterPill label="Pantry" active={activeFilter === "pantry"} onClick={() => setActiveFilter("pantry")} />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => {
            const next = !addOpen;
            setAddOpen(next);

            // when opening, seed default use_by if empty/auto
            if (!addOpen && next) {
              const baseStored = addStoredOn || todayAsDateInput();
              const computed = computeDefaultUseBy(addLocation, baseStored, addUseBy, addUseByAuto);
              if (computed.use_by !== addUseBy) setAddUseBy(computed.use_by);
              if (computed.useByAuto !== addUseByAuto) setAddUseByAuto(computed.useByAuto);
            }
          }}
          className={headerBtn}
          aria-expanded={addOpen}
        >
          {addOpen ? "Close" : "Add"}
        </button>

        <button type="button" onClick={() => router.push("/frostpantry/receipt")} className={headerBtn}>
          Scan receipt
        </button>
      </div>
    </div>
  );

  /* =========================
     Render
  ========================= */

  return (
    <RcPageShell header={header}>
      {/* Inline Add panel */}
      {addOpen ? (
        <div className="mt-8 rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Item name"
                className="w-[320px] rounded-2xl bg-white/5 text-white placeholder:text-white/35 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                autoFocus
              />

              <select
                value={addLocation}
                onChange={(e) => setAddLocation(e.target.value as Location)}
                className="w-[180px] rounded-2xl bg-[#0b1026] text-white ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
              >
                <option value="Freezer">Freezer</option>
                <option value="Fridge">Fridge</option>
                <option value="Pantry">Pantry</option>
              </select>

              <input
                type="number"
                min={1}
                value={addQty}
                onChange={(e) => setAddQty(Number(e.target.value) || 1)}
                className="w-[120px] rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
              />

              <input
                value={addUnit}
                onChange={(e) => setAddUnit(e.target.value)}
                placeholder="unit"
                className="w-[160px] rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
              />
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-xs text-white/50">Stored on</div>
                <input
                  type="date"
                  value={addStoredOn}
                  onChange={(e) => setAddStoredOn(e.target.value)}
                  className="w-[220px] rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="text-xs text-white/50">Use by (optional)</div>
                <input
                  type="date"
                  value={addUseBy}
                  onChange={(e) => {
                    const next = e.target.value;
                    setAddUseBy(next);

                    // If user sets a value -> manual.
                    // If user clears -> returns to auto behavior.
                    if (next.trim() === "") setAddUseByAuto(true);
                    else setAddUseByAuto(false);
                  }}
                  className="w-[220px] rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                />
              </div>

              <div className="text-xs text-white/45 pb-2">
                Defaults: Fridge 30d • Pantry/Freezer 6mo
                {!addUseByAuto ? <span className="text-white/40"> • manual</span> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setAddOpen(false)} className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3">
                Never mind
              </button>

              <button
                type="submit"
                disabled={addBusy || !addName.trim()}
                className="rounded-2xl bg-fuchsia-500 hover:bg-fuchsia-400 px-5 py-3 font-semibold disabled:opacity-50 shadow-lg shadow-fuchsia-500/20"
              >
                {addBusy ? "Saving…" : "Add item"}
              </button>
            </div>
          </form>

          {errorMsg ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-950/40 px-5 py-4 text-red-100">{errorMsg}</div>
          ) : null}
        </div>
      ) : errorMsg ? (
        <div className="mt-8 rounded-xl border border-red-500/30 bg-red-950/40 px-5 py-4 text-red-100">{errorMsg}</div>
      ) : null}

      {/* Use Soon-ish (calm + compact) */}
      {soonishMain.length > 0 ? (
        <div className="mt-8 rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Use Soon-ish</h2>
              <p className="mt-2 text-white/70">Worth a quick look.</p>
            </div>

            <button
              type="button"
              onClick={() => setActiveFilter("soonish")}
              className="rounded-full bg-white/10 hover:bg-white/15 px-5 py-3 text-sm font-semibold ring-1 ring-white/10"
            >
              {soonishRemaining > 0 ? `View ${soonishRemaining} more items` : "View"}
            </button>
          </div>

          <div className="mt-5 grid gap-2">
            {soonishMain.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3">
                <div className="text-white/85 font-semibold truncate">{i.name}</div>
                <div className="flex items-center gap-2 shrink-0">
                  {i.is_leftover ? <Chip text="Leftover" /> : null}
                  <Chip text={i.location} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Expired mini */}
      {expiredItems.length > 0 ? (
        <div className="mt-3 rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-white/75">
              <span className="font-semibold text-white/85">Expired</span>{" "}
              <span className="text-white/55">({expiredItems.length})</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveFilter("expired")}
              className="rounded-full bg-white/10 hover:bg-white/15 px-4 py-2 text-sm font-semibold ring-1 ring-white/10"
            >
              View
            </button>
          </div>
        </div>
      ) : null}

      {/* Actions bar */}
      <div className="mt-8 rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-white/60">
            Showing <span className="text-white/80 font-semibold">{filtered.length}</span> item{filtered.length === 1 ? "" : "s"}.
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={toggleSelectAllFiltered}
              disabled={filteredIds.length === 0}
              className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3 disabled:opacity-50"
            >
              {selectedAllFiltered ? "Unselect all (view)" : "Select all (view)"}
            </button>

            <button type="button" onClick={loadItems} className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3">
              Refresh
            </button>

            {selectionCount > 0 ? (
              <button
                type="button"
                onClick={deleteSelected}
                disabled={bulkBusy}
                className="rounded-2xl bg-red-600 hover:bg-red-500 px-5 py-3 disabled:opacity-60"
              >
                {bulkBusy ? "Deleting…" : `Delete selected (${selectionCount})`}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Main list */}
      {loading ? (
        <div className="mt-8 text-white/70">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 text-white/55">
          <div className="font-semibold text-white/70">Nothing here yet.</div>
          <div className="mt-1 text-sm text-white/50">Add an item when you feel like it. Yes, even the mystery rice from 2014.</div>
        </div>
      ) : (
        <div className="mt-8 grid gap-6">
          {filtered.map((item) => {
            const checked = selectedSet.has(item.id);
            const expired = isExpired(item);

            return (
              <div key={item.id} className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-4">
                    <label className="flex items-center gap-2 pt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelected(item.id)}
                        className="h-4 w-4 accent-fuchsia-500"
                      />
                    </label>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-2xl font-extrabold tracking-tight">{item.name}</div>

                        {isOut(item) ? <Chip text="Out" tone="out" /> : null}
                        {!isOut(item) && isLow(item) ? <Chip text="Low" tone="low" /> : null}

                        {expired ? <Chip text="Expired" tone="expired" /> : null}
                        {item.is_leftover ? <Chip text="Leftover" /> : null}

                        <Chip text={item.location} />
                      </div>

                      <div className="mt-2 text-white/55 text-sm">
                        {prettyDateShort(item.stored_on) ? `stored ${prettyDateShort(item.stored_on)}` : "—"}
                        {item.use_by ? ` • use by ${prettyDateShort(item.use_by)}` : ""}
                      </div>

                      {item.notes ? <div className="mt-2 text-white/50 text-sm">{item.notes}</div> : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2"
                        disabled={busyId === item.id || bulkBusy}
                        onClick={() => changeQuantity(item.id, -1)}
                        type="button"
                      >
                        –
                      </button>

                      <div className="min-w-[120px] text-center font-semibold text-white/85">
                        {item.quantity} {item.unit}
                      </div>

                      <button
                        className="rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2"
                        disabled={busyId === item.id || bulkBusy}
                        onClick={() => changeQuantity(item.id, +1)}
                        type="button"
                      >
                        +
                      </button>
                    </div>

                    <Link href={`/frostpantry/edit/${item.id}`} className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3">
                      Edit
                    </Link>

                    <button
                      className="rounded-2xl bg-red-600 hover:bg-red-500 px-5 py-3 disabled:opacity-60"
                      disabled={busyId === item.id || bulkBusy}
                      onClick={() => deleteItem(item.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </RcPageShell>
  );
}

/* ========================= */

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const base =
    "group relative inline-flex items-center gap-3 rounded-full bg-white/10 hover:bg-white/15 px-5 py-3 text-sm font-semibold ring-1 ring-white/10 transition";
  const activeCls =
    "group relative inline-flex items-center gap-3 rounded-full bg-fuchsia-500/80 hover:bg-fuchsia-500 px-5 py-3 text-sm font-extrabold text-white ring-1 ring-white/10 transition";

  return (
    <button type="button" onClick={onClick} className={active ? activeCls : base}>
      {label}
    </button>
  );
}
