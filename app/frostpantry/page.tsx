"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return Math.floor(diff);
}

function prettyDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function urgencyBadge(useBy: string | null) {
  const d = daysUntil(useBy);
  if (d == null) return { text: "no date", className: "rc-badge" };

  if (d < 0) return { text: `expired (${Math.abs(d)}d)`, className: "rc-badge rc-badge--danger" };
  if (d === 0) return { text: "today", className: "rc-badge rc-badge--warn" };
  if (d <= 7) return { text: `use within ${d}d`, className: "rc-badge rc-badge--warn" };
  if (d <= 30) return { text: `use within ${d}d`, className: "rc-badge" };
  return { text: `ok (${d}d)`, className: "rc-badge" };
}

export default function FrostPantryPage() {
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  // ✅ Selection state switched to array (more reliable UI updates than Set)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Quick Add form state
  const [qaName, setQaName] = useState("");
  const [qaLocation, setQaLocation] = useState<"Freezer" | "Fridge" | "Pantry">("Freezer");
  const [qaQty, setQaQty] = useState<number>(1);
  const [qaUnit, setQaUnit] = useState("bag");
  const [qaBusy, setQaBusy] = useState(false);

  async function loadItems() {
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/storage-items", { cache: "no-store" });
      const json = await res.json();

      if (!json.ok) throw new Error(json.error || "Failed to load items");

      setItems(json.items ?? []);
    } catch (err: any) {
      console.error(err);
      setItems([]);
      setErrorMsg(err?.message ?? "Failed to load Pantry & Freezer");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, []);

  const filtered = useMemo(() => {
    const today = new Date();
    const base = items.slice();

    function byUseWindow(days: number) {
      return base.filter((i) => {
        if (!i.use_by) return false;
        const d = new Date(i.use_by);
        const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= days;
      });
    }

    switch (activeFilter) {
      case "leftovers":
        return base.filter((i) => i.is_leftover);
      case "regular":
        return base.filter((i) => !i.is_leftover);
      case "expiring7":
        return byUseWindow(7);
      case "expiring30":
        return byUseWindow(30);
      case "freezer":
        return base.filter((i) => i.location === "Freezer");
      case "fridge":
        return base.filter((i) => i.location === "Fridge");
      case "pantry":
        return base.filter((i) => i.location === "Pantry");
      default:
        return base;
    }
  }, [items, activeFilter]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectionCount = selectedIds.length;

  const filteredIds = useMemo(() => filtered.map((i) => i.id), [filtered]);

  const selectedAllFiltered = useMemo(() => {
    if (filteredIds.length === 0) return false;
    for (const id of filteredIds) {
      if (!selectedSet.has(id)) return false;
    }
    return true;
  }, [filteredIds, selectedSet]);

  // Keep selection valid when items reload
  useEffect(() => {
    if (selectedIds.length === 0) return;

    const existing = new Set(items.map((i) => i.id));
    setSelectedIds((prev) => prev.filter((id) => existing.has(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const stats = useMemo(() => {
    const totalUnits = items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);
    const expired = items.filter((i) => {
      const d = daysUntil(i.use_by);
      return d != null && d < 0;
    }).length;

    const useWithin30 = items.filter((i) => {
      const d = daysUntil(i.use_by);
      return d != null && d >= 0 && d <= 30;
    }).length;

    const leftoversCount = items.filter((i) => i.is_leftover).length;

    const urgent =
      items
        .filter((i) => i.use_by)
        .slice()
        .sort((a, b) => new Date(a.use_by as string).getTime() - new Date(b.use_by as string).getTime())[0] ?? null;

    return { totalUnits, expired, useWithin30, leftoversCount, urgent };
  }, [items]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const prevSet = new Set(prev);

      if (selectedAllFiltered) {
        // remove all visible ids
        const next = prev.filter((id) => !filteredIds.includes(id));
        return next;
      }

      // add all visible ids
      for (const id of filteredIds) prevSet.add(id);
      return Array.from(prevSet);
    });
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
      if (!json.ok) throw new Error(json.error || "Failed to update quantity");

      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: newQty } : i)));
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? "Failed to update quantity");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this item from Pantry & Freezer?")) return;
    setBusyId(id);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/storage-items/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.ok === false)) throw new Error(json?.error || "Failed to delete item");

      setItems((prev) => prev.filter((i) => i.id !== id));
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? "Failed to delete item");
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

          let json: any = null;
          try {
            json = await res.clone().json();
          } catch {}

          if (!res.ok || (json && json.ok === false)) {
            throw new Error(json?.error || `Failed to delete ${id}`);
          }

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
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? "Bulk delete failed");
    } finally {
      setBulkBusy(false);
    }
  }

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

      let json: any = null;
      try {
        json = await res.clone().json();
      } catch {}

      if (!res.ok || (json && json.ok === false)) {
        throw new Error(json?.error || `Failed to add item (status ${res.status})`);
      }

      await loadItems();
      setQaName("");
      setQaQty(1);
      setQaUnit("bag");
    } catch (err: any) {
      console.error("Quick add error:", err);
      setErrorMsg(err?.message ?? "Failed to add item");
    } finally {
      setQaBusy(false);
    }
  }

  return (
    <div className="rc-container" style={{ paddingBottom: 28 }}>
      <div className="rc-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 44, margin: 0, letterSpacing: -0.5 }}>Pantry &amp; Freezer</h1>
          <div className="rc-subtle" style={{ marginTop: 10 }}>
            Readable cards. Faster scanning. Less “where did I put that?”
          </div>
        </div>

        <div className="rc-row">
          <form onSubmit={handleQuickAdd} className="rc-panel" style={{ padding: 10 }}>
            <div className="rc-row" style={{ alignItems: "center", gap: 10 }}>
              <input
                value={qaName}
                onChange={(e) => setQaName(e.target.value)}
                placeholder="Quick add: name"
                className="rc-input"
                style={{ width: 220 }}
              />
              <select
                value={qaLocation}
                onChange={(e) => setQaLocation(e.target.value as any)}
                className="rc-select"
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
                className="rc-input"
                style={{ width: 90 }}
              />
              <input
                value={qaUnit}
                onChange={(e) => setQaUnit(e.target.value)}
                className="rc-input"
                style={{ width: 110 }}
                placeholder="unit"
              />
              <button type="submit" disabled={qaBusy || !qaName.trim()} className="rc-btn rc-btn-dark">
                {qaBusy ? "Saving…" : "Quick add"}
              </button>
              <Link href="/frostpantry/add" className="rc-btn rc-btn--primary">
                + Add item
              </Link>
            </div>
          </form>
        </div>
      </div>

      {stats.urgent ? (
        <div className="rc-panel" style={{ marginTop: 16 }}>
          <div className="rc-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>🔥 Eat this first</div>
              <div className="rc-subtle" style={{ marginTop: 6 }}>
                Top of the “use it or lose it” list
              </div>
              <div style={{ marginTop: 10, fontSize: 18, fontWeight: 750 }}>{stats.urgent.name}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className={urgencyBadge(stats.urgent.use_by).className}>
                {urgencyBadge(stats.urgent.use_by).text}
              </div>
              <div className="rc-tiny" style={{ marginTop: 8 }}>
                use by {prettyDate(stats.urgent.use_by)}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {errorMsg ? (
        <div className="rc-panel" style={{ marginTop: 14, borderColor: "rgba(255,0,0,0.25)" }}>
          <div style={{ color: "rgba(255,255,255,0.9)" }}>{errorMsg}</div>
        </div>
      ) : null}

      {/* Bulk bar */}
      {selectionCount > 0 ? (
        <div
          className="rc-panel"
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div className="rc-row" style={{ gap: 10 }}>
            <span className="rc-badge">{selectionCount} selected</span>
            <button className="rc-btn" type="button" onClick={clearSelection} disabled={bulkBusy}>
              Clear selection
            </button>
          </div>

          <div className="rc-row" style={{ gap: 10 }}>
            <button
              className="rc-btn"
              type="button"
              onClick={deleteSelected}
              disabled={bulkBusy}
              style={{ borderColor: "rgba(255,0,0,0.25)" }}
            >
              {bulkBusy ? "Deleting…" : "Delete selected"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Stats */}
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}
      >
        <div className="rc-card">
          <div className="rc-subtle">Total units</div>
          <div style={{ fontSize: 26, fontWeight: 850, marginTop: 6 }}>{stats.totalUnits}</div>
        </div>
        <div className="rc-card">
          <div className="rc-subtle">Use within 30d</div>
          <div style={{ fontSize: 26, fontWeight: 850, marginTop: 6 }}>{stats.useWithin30}</div>
        </div>
        <div className="rc-card">
          <div className="rc-subtle">Expired</div>
          <div style={{ fontSize: 26, fontWeight: 850, marginTop: 6 }}>{stats.expired}</div>
        </div>
        <div className="rc-card">
          <div className="rc-subtle">Leftovers</div>
          <div style={{ fontSize: 26, fontWeight: 850, marginTop: 6 }}>{stats.leftoversCount}</div>
        </div>
      </div>

      {/* Filters + select controls */}
      <div className="rc-row" style={{ marginTop: 14, flexWrap: "wrap", gap: 10 }}>
        <FilterPill label="All" active={activeFilter === "all"} onClick={() => setActiveFilter("all")} />
        <FilterPill label="Leftovers" active={activeFilter === "leftovers"} onClick={() => setActiveFilter("leftovers")} />
        <FilterPill label="Regular" active={activeFilter === "regular"} onClick={() => setActiveFilter("regular")} />
        <FilterPill label="Expiring 7d" active={activeFilter === "expiring7"} onClick={() => setActiveFilter("expiring7")} />
        <FilterPill label="Expiring 30d" active={activeFilter === "expiring30"} onClick={() => setActiveFilter("expiring30")} />
        <FilterPill label="Freezer" active={activeFilter === "freezer"} onClick={() => setActiveFilter("freezer")} />
        <FilterPill label="Fridge" active={activeFilter === "fridge"} onClick={() => setActiveFilter("fridge")} />
        <FilterPill label="Pantry" active={activeFilter === "pantry"} onClick={() => setActiveFilter("pantry")} />

        <div className="rc-row" style={{ marginLeft: "auto", gap: 10, flexWrap: "wrap" }}>
          <button className="rc-btn" type="button" onClick={toggleSelectAllFiltered} disabled={filteredIds.length === 0}>
            {selectedAllFiltered ? "Unselect all (view)" : "Select all (view)"}
          </button>
          <button className="rc-btn" type="button" onClick={clearSelection} disabled={selectionCount === 0}>
            Clear selected
          </button>
          <button className="rc-btn" onClick={loadItems} type="button">
            Refresh
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ marginTop: 16, opacity: 0.85 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rc-panel" style={{ marginTop: 16, opacity: 0.9 }}>
          Nothing here yet. Click <b>+ Add item</b> to start tracking.
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {filtered.map((item) => {
            const badge = urgencyBadge(item.use_by);
            const checked = selectedSet.has(item.id);

            return (
              <div key={item.id} className="rc-card">
                <div className="rc-row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div className="rc-row" style={{ gap: 12, alignItems: "flex-start" }}>
                    {/* Row checkbox */}
                    <label
                      className="rc-row"
                      style={{ gap: 10, alignItems: "center", paddingTop: 2, cursor: "pointer" }}
                      title="Select"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelected(item.id)}
                        style={{ width: 18, height: 18, accentColor: "rgb(217, 70, 239)" }}
                      />
                    </label>

                    <div style={{ minWidth: 220 }}>
                      <div className="rc-row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 850, fontSize: 18 }}>{item.name}</div>
                        {item.is_leftover ? <span className="rc-badge">leftover</span> : null}
                        <span className={badge.className}>{badge.text}</span>
                        <span className="rc-badge">{item.location}</span>
                      </div>

                      <div className="rc-subtle" style={{ marginTop: 8 }}>
                        stored {prettyDate(item.stored_on)} • use by {prettyDate(item.use_by)}
                      </div>

                      {item.notes ? (
                        <div className="rc-tiny" style={{ marginTop: 8, opacity: 0.75 }}>
                          {item.notes}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rc-row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div className="rc-row" style={{ gap: 8, alignItems: "center" }}>
                      <button
                        className="rc-btn"
                        disabled={busyId === item.id || bulkBusy}
                        onClick={() => changeQuantity(item.id, -1)}
                        title="Decrease"
                        type="button"
                      >
                        –
                      </button>
                      <div style={{ minWidth: 120, textAlign: "center", fontWeight: 750 }}>
                        {item.quantity} {item.unit}
                      </div>
                      <button
                        className="rc-btn"
                        disabled={busyId === item.id || bulkBusy}
                        onClick={() => changeQuantity(item.id, +1)}
                        title="Increase"
                        type="button"
                      >
                        +
                      </button>
                    </div>

                    <Link href={`/frostpantry/edit/${item.id}`} className="rc-btn rc-btn--ghost">
                      Edit
                    </Link>
                    <button
                      className="rc-btn"
                      disabled={busyId === item.id || bulkBusy}
                      onClick={() => deleteItem(item.id)}
                      style={{ borderColor: "rgba(255,0,0,0.25)" }}
                      title="Delete"
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
      className="rc-btn"
      type="button"
      style={{
        borderRadius: 999,
        padding: "10px 14px",
        opacity: active ? 1 : 0.85,
        borderColor: active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.12)",
      }}
    >
      {label}
    </button>
  );
}
