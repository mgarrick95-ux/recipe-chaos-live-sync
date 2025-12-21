// app/frostpantry/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type StorageItem = {
  id: string;
  name: string;
  location: string;
  quantity: number;
  unit: string;
  is_leftover: boolean;
  stored_on: string | null;
  use_by: string | null;
  notes: string | null;
  created_at: string;
};

type FilterTab =
  | "all"
  | "leftovers"
  | "regular"
  | "expiring7"
  | "expiring30"
  | "freezer"
  | "fridge"
  | "pantry";

export default function FrostPantryPage() {
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Quick Add form state
  const [qaName, setQaName] = useState("");
  const [qaLocation, setQaLocation] = useState<"Freezer" | "Fridge" | "Pantry">(
    "Freezer"
  );
  const [qaQty, setQaQty] = useState<number>(1);
  const [qaUnit, setQaUnit] = useState("bag");
  const [qaBusy, setQaBusy] = useState(false);

  async function loadItems() {
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/storage-items", { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error || "Failed to load items");
      }

      setItems(json.items ?? []);
    } catch (err: any) {
      console.error(err);
      setItems([]);
      setErrorMsg(err?.message ?? "Failed to load FrostPantry");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  function filterItems(list: StorageItem[]) {
    const today = new Date();

    switch (activeFilter) {
      case "leftovers":
        return list.filter((i) => i.is_leftover);
      case "regular":
        return list.filter((i) => !i.is_leftover);
      case "expiring7":
        return list.filter((i) => {
          if (!i.use_by) return false;
          const d = new Date(i.use_by);
          const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
          return diff >= 0 && diff <= 7;
        });
      case "expiring30":
        return list.filter((i) => {
          if (!i.use_by) return false;
          const d = new Date(i.use_by);
          const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
          return diff >= 0 && diff <= 30;
        });
      case "freezer":
        return list.filter((i) => i.location === "Freezer");
      case "fridge":
        return list.filter((i) => i.location === "Fridge");
      case "pantry":
        return list.filter((i) => i.location === "Pantry");
      default:
        return list;
    }
  }

  async function changeQuantity(id: string, delta: number) {
    const target = items.find((i) => i.id === id);
    if (!target) return;

    const newQty = Math.max(0, (target.quantity ?? 0) + delta);
    if (newQty === target.quantity) return;

    setBusyId(id);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/storage-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQty }),
      });

      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to update quantity");
      }

      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, quantity: newQty } : i))
      );
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? "Failed to update quantity");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this item from FrostPantry?")) return;
    setBusyId(id);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/storage-items/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error || "Failed to delete item");
      }

      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? "Failed to delete item");
    } finally {
      setBusyId(null);
    }
  }

  // SAFE Quick Add handler (no more JSON parse crash)
  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!qaName.trim()) return;

    setErrorMsg("");
    setQaBusy(true);

    try {
      const res = await fetch("/api/storage-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: qaName.trim(),
          location: qaLocation,
          quantity: qaQty || 1,
          unit: qaUnit.trim() || "unit",
          is_leftover: false,
        }),
      });

      // Defensive JSON parse – this will NOT throw if the body is empty.
      let json: any = null;
      try {
        json = await res.clone().json();
      } catch {
        // no JSON body, that's OK
      }

      if (!res.ok || (json && json.ok === false)) {
        const message =
          json?.error ||
          `Failed to add FrostPantry item (status ${res.status})`;
        throw new Error(message);
      }

      // Reload list and reset form
      await loadItems();
      setQaName("");
      setQaQty(1);
      setQaUnit("bag");
    } catch (err: any) {
      console.error("Quick add error:", err);
      setErrorMsg(err?.message ?? "Failed to add FrostPantry item");
    } finally {
      setQaBusy(false);
    }
  }

  const filtered = filterItems(items);

  const totalItems = items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);
  const urgent = items.filter((i) => {
    if (!i.use_by) return false;
    const d = new Date(i.use_by);
    const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff < 0;
  }).length;
  const expiring30 = items.filter((i) => {
    if (!i.use_by) return false;
    const d = new Date(i.use_by);
    const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  }).length;
  const leftoversCount = items.filter((i) => i.is_leftover).length;

  // Find the single most urgent item for the banner
  const urgentItems = items
    .filter((i) => i.use_by)
    .sort((a, b) => {
      return (
        new Date(a.use_by as string).getTime() -
        new Date(b.use_by as string).getTime()
      );
    });

  const topUrgent = urgentItems[0] ?? null;

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Header row: title + Quick Add + full add */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">FrostPantry</h1>
            <p className="text-sm text-gray-400 mt-1">
              A calm little command center for everything hiding in your freezer
              and pantry.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            {/* Quick Add mini form */}
            <form
              onSubmit={handleQuickAdd}
              className="flex items-center gap-2 bg-slate-900/60 rounded-full px-3 py-1.5"
            >
              <input
                type="text"
                value={qaName}
                onChange={(e) => setQaName(e.target.value)}
                placeholder="Quick add: name"
                className="bg-transparent text-xs outline-none placeholder:text-slate-500 w-28 sm:w-32"
              />
              <select
                value={qaLocation}
                onChange={(e) =>
                  setQaLocation(e.target.value as "Freezer" | "Fridge" | "Pantry")
                }
                className="bg-slate-800 text-xs rounded-full px-2 py-1 outline-none"
              >
                <option value="Freezer">Freezer</option>
                <option value="Fridge">Fridge</option>
                <option value="Pantry">Pantry</option>
              </select>
              <input
                type="number"
                min={1}
                value={qaQty}
                onChange={(e) => setQaQty(Number(e.target.value) || 1)}
                className="bg-slate-800 text-xs rounded-full px-2 py-1 w-14 outline-none"
              />
              <input
                type="text"
                value={qaUnit}
                onChange={(e) => setQaUnit(e.target.value)}
                className="bg-slate-800 text-xs rounded-full px-2 py-1 w-16 outline-none"
                placeholder="unit"
              />
              <button
                type="submit"
                disabled={qaBusy || !qaName.trim()}
                className="text-xs font-semibold rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 px-3 py-1 disabled:opacity-50"
              >
                {qaBusy ? "Saving…" : "Quick add"}
              </button>
            </form>

            {/* Full add page */}
            <Link
              href="/frostpantry/add"
              className="rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 px-6 py-3 font-semibold shadow-lg shadow-fuchsia-500/40 transition text-center"
            >
              + Add item
            </Link>
          </div>
        </div>

        {/* Eat this first banner */}
        {topUrgent && (
          <div className="mb-6 rounded-xl bg-red-900/80 border border-red-700 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">🔥</span>
                <p className="font-semibold text-lg">Eat this first</p>
              </div>
              <p className="text-sm text-red-100/80 mt-1">
                These are at the top of the &quot;use it or lose it&quot; list.
              </p>
              <p className="mt-2 font-semibold">{topUrgent.name}</p>
            </div>
            <div className="text-sm text-red-100/80 self-end sm:self-auto">
              use by{" "}
              {topUrgent.use_by
                ? new Date(topUrgent.use_by).toLocaleDateString()
                : "soon"}
            </div>
          </div>
        )}

        {/* Error banner */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-800/80 px-4 py-2 text-sm">
            {errorMsg}
          </div>
        )}

        {/* Stats */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-4 mb-6">
          <StatCard label="Total items" value={totalItems} />
          <StatCard label="Use within next while" value={expiring30} />
          <StatCard label="Urgent / ancient" value={urgent} />
          <StatCard label="Leftovers" value={leftoversCount} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <FilterPill
            label="All"
            active={activeFilter === "all"}
            onClick={() => setActiveFilter("all")}
          />
          <FilterPill
            label="Leftovers"
            active={activeFilter === "leftovers"}
            onClick={() => setActiveFilter("leftovers")}
          />
          <FilterPill
            label="Regular"
            active={activeFilter === "regular"}
            onClick={() => setActiveFilter("regular")}
          />
          <FilterPill
            label="Expiring in 7 days"
            active={activeFilter === "expiring7"}
            onClick={() => setActiveFilter("expiring7")}
          />
          <FilterPill
            label="Expiring in 30 days"
            active={activeFilter === "expiring30"}
            onClick={() => setActiveFilter("expiring30")}
          />
          <FilterPill
            label="Freezer"
            active={activeFilter === "freezer"}
            onClick={() => setActiveFilter("freezer")}
          />
          <FilterPill
            label="Fridge"
            active={activeFilter === "fridge"}
            onClick={() => setActiveFilter("fridge")}
          />
          <FilterPill
            label="Pantry"
            active={activeFilter === "pantry"}
            onClick={() => setActiveFilter("pantry")}
          />
        </div>

        {/* List */}
        {loading ? (
          <p className="text-gray-400">Loading FrostPantry…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400">
            Nothing here yet. Tap{" "}
            <span className="font-semibold text-fuchsia-400">Add item</span> to
            start tracking.
          </p>
        ) : (
          <div className="space-y-4">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="rounded-xl bg-[#050b1e] border border-slate-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{item.name}</h3>
                    {item.is_leftover && (
                      <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
                        leftover
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">
                    Qty: {item.quantity} {item.unit} • Stored:{" "}
                    {item.stored_on
                      ? new Date(item.stored_on).toLocaleDateString()
                      : "—"}{" "}
                    • Use by:{" "}
                    {item.use_by
                      ? new Date(item.use_by).toLocaleDateString()
                      : "—"}
                  </p>
                  {item.notes && (
                    <p className="mt-1 text-xs text-gray-400">{item.notes}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* quantity controls */}
                  <div className="flex items-center gap-1 bg-slate-900 rounded-full px-2 py-1">
                    <button
                      disabled={busyId === item.id}
                      onClick={() => changeQuantity(item.id, -1)}
                      className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-lg leading-none disabled:opacity-50"
                    >
                      –
                    </button>
                    <span className="px-2 text-sm">
                      {item.quantity} {item.unit}
                    </span>
                    <button
                      disabled={busyId === item.id}
                      onClick={() => changeQuantity(item.id, +1)}
                      className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-lg leading-none disabled:opacity-50"
                    >
                      +
                    </button>
                  </div>

                  {/* edit / delete */}
                  <Link
                    href={`/frostpantry/edit/${item.id}`}
                    className="text-sm px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700"
                  >
                    Edit
                  </Link>
                  <button
                    disabled={busyId === item.id}
                    onClick={() => deleteItem(item.id)}
                    className="text-sm px-3 py-1.5 rounded-full bg-red-600 hover:bg-red-500 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[#050b1e] border border-slate-800 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
        active
          ? "bg-fuchsia-500 text-white shadow shadow-fuchsia-500/40"
          : "bg-slate-800 text-gray-300 hover:bg-slate-700"
      }`}
    >
      {label}
    </button>
  );
}
