// app/frostpantry/page.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import RcPageShell from "@/components/rc/RcPageShell";
import ReceiptScanTool from "@/components/frostpantry/ReceiptScanTool";
import RcPageHero from "@/components/rc/RcPageHero";

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

type FilterTab =
  | "all"
  | "leftovers"
  | "soonish"
  | "expired"
  | "freezer"
  | "fridge"
  | "pantry"
  | "duplicates";

/* =========================
   Constants
========================= */

const SOONISH_LIMIT_MAIN = 3;

const SOONISH_BY_LOCATION: Record<Location, number> = {
  Pantry: 0,
  Fridge: 2,
  Freezer: 5,
};

const SOONISH_LEFTOVER_DAYS = 3;

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
   Duplicate detection helpers
========================= */

function normalizeNameForDupe(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNullable(s: string | null | undefined) {
  return (s ?? "").toString().trim();
}

/* =========================
   Chip
========================= */

function Chip({
  text,
  tone = "default",
}: {
  text: string;
  tone?: "default" | "out" | "expired" | "duplicate";
}) {
  const styles: Record<string, React.CSSProperties> = {
    default: {
      borderColor: "rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.06)",
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
    duplicate: {
      background: "rgba(34,211,238,0.22)",
      borderColor: "rgba(34,211,238,0.85)",
      color: "rgba(255,255,255,0.98)",
      boxShadow: "0 0 0 2px rgba(34,211,238,0.14), 0 10px 24px rgba(34,211,238,0.10)",
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
        fontWeight: 800,
        lineHeight: 1,
        letterSpacing: "0.01em",
        ...styles[tone],
      }}
    >
      {text}
    </span>
  );
}

/* =========================
   Inline edit types
========================= */

type EditDraft = {
  name: string;
  location: Location;
  quantity: number;
  unit: string;
  stored_on: string; // date input string ("" allowed)
  use_by: string; // date input string ("" allowed)
  notes: string;
  is_leftover: boolean;
};

function makeDraftFromItem(it: StorageItem): EditDraft {
  return {
    name: it.name ?? "",
    location: it.location ?? "Freezer",
    quantity: Number.isFinite(Number(it.quantity)) ? Number(it.quantity) : 1,
    unit: it.unit ?? "unit",
    stored_on: it.stored_on ?? "",
    use_by: it.use_by ?? "",
    notes: it.notes ?? "",
    is_leftover: Boolean(it.is_leftover),
  };
}

/* =========================
   Duplicate review / merge helpers
========================= */

function dupeKeyForItem(it: StorageItem) {
  const nm = normalizeNameForDupe(it.name || "");
  return `${it.location}|${nm}`;
}

function canMergeGroup(items: StorageItem[]) {
  if (items.length <= 1) return { ok: false, reason: "Not a duplicate group." };

  const base = items[0];

  const unit = normalizeNullable(base.unit);
  const stored_on = normalizeNullable(base.stored_on);
  const use_by = normalizeNullable(base.use_by);
  const notes = normalizeNullable(base.notes);
  const is_leftover = Boolean(base.is_leftover);
  const location = base.location;

  for (const it of items) {
    if (it.location !== location) return { ok: false, reason: "Different locations." };
    if (normalizeNullable(it.unit) !== unit) return { ok: false, reason: "Different units." };
    if (Boolean(it.is_leftover) !== is_leftover) return { ok: false, reason: "Leftover flag differs." };
    if (normalizeNullable(it.stored_on) !== stored_on) return { ok: false, reason: "Stored-on differs." };
    if (normalizeNullable(it.use_by) !== use_by) return { ok: false, reason: "Use-by differs." };
    if (normalizeNullable(it.notes) !== notes) return { ok: false, reason: "Notes differ." };
  }

  return { ok: true, reason: "" };
}

/* =========================
   Page
========================= */

type AddPanel = "none" | "type" | "paste" | "upload";

export default function FrostPantryPage() {
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [hideOutItems, setHideOutItems] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Inline panels
  const [addPanel, setAddPanel] = useState<AddPanel>("none");

  // Add popover
  const [addOptionsOpen, setAddOptionsOpen] = useState(false);
  const addOptionsRef = useRef<HTMLDivElement | null>(null);

  // Type-it state
  const [addName, setAddName] = useState("");
  const [addLocation, setAddLocation] = useState<Location>("Freezer");
  const [addQty, setAddQty] = useState<number>(1);
  const [addUnit, setAddUnit] = useState("bag");

  const [addStoredOn, setAddStoredOn] = useState<string>(() => todayAsDateInput());
  const [addUseBy, setAddUseBy] = useState<string>("");
  const [addUseByAuto, setAddUseByAuto] = useState<boolean>(true);
  const [addBusy, setAddBusy] = useState(false);

  // Shop day (already exists in your UI)
  const [shopDay, setShopDay] = useState<string>("Sunday");

  // Inline edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editUseByAuto, setEditUseByAuto] = useState<boolean>(false);
  const [editBusy, setEditBusy] = useState(false);

  // Duplicate review modal state
  const [dupeModalOpen, setDupeModalOpen] = useState(false);
  const [dupeModalKey, setDupeModalKey] = useState<string | null>(null);
  const [dupeKeepId, setDupeKeepId] = useState<string>("");
  const [dupeBusy, setDupeBusy] = useState(false);
  const [dupeError, setDupeError] = useState<string>("");

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!addOptionsRef.current) return;
      if (addOptionsRef.current.contains(e.target as Node)) return;
      setAddOptionsOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

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

  // Keep use-by in sync while auto (Add panel)
  useEffect(() => {
    if (addPanel !== "type") return;
    const computed = computeDefaultUseBy(addLocation, addStoredOn, addUseBy, addUseByAuto);
    if (computed.use_by !== addUseBy) setAddUseBy(computed.use_by);
    if (computed.useByAuto !== addUseByAuto) setAddUseByAuto(computed.useByAuto);
  }, [addPanel, addLocation, addStoredOn, addUseBy, addUseByAuto]);

  // Keep use-by in sync while auto (Edit inline)
  useEffect(() => {
    if (!editId || !editDraft) return;
    const stored = editDraft.stored_on || "";
    if (!stored) return;

    const computed = computeDefaultUseBy(editDraft.location, stored, editDraft.use_by ?? "", editUseByAuto);

    if (computed.use_by !== editDraft.use_by) {
      setEditDraft((prev) => (prev ? { ...prev, use_by: computed.use_by } : prev));
    }
    if (computed.useByAuto !== editUseByAuto) {
      setEditUseByAuto(computed.useByAuto);
    }
  }, [editId, editDraft?.location, editDraft?.stored_on, editDraft?.use_by, editUseByAuto]);

  /* =========================
     Duplicate maps / counts
  ========================= */

  const duplicateCountById = useMemo(() => {
    const counts = new Map<string, number>();
    const keyToIds = new Map<string, string[]>();

    for (const it of items) {
      const nm = normalizeNameForDupe(it.name || "");
      if (!nm) continue;
      const key = `${it.location}|${nm}`;
      const arr = keyToIds.get(key) ?? [];
      arr.push(it.id);
      keyToIds.set(key, arr);
    }

    for (const [, ids] of keyToIds.entries()) {
      if (ids.length <= 1) continue;
      for (const id of ids) counts.set(id, ids.length);
    }

    return counts;
  }, [items]);

  const duplicateGroups = useMemo(() => {
    const keyToItems = new Map<string, StorageItem[]>();
    for (const it of items) {
      const nm = normalizeNameForDupe(it.name || "");
      if (!nm) continue;
      const key = `${it.location}|${nm}`;
      const arr = keyToItems.get(key) ?? [];
      arr.push(it);
      keyToItems.set(key, arr);
    }

    const groups: Array<{ key: string; items: StorageItem[]; location: Location; name: string }> = [];
    for (const [key, arr] of keyToItems.entries()) {
      if (arr.length <= 1) continue;
      const first = arr[0];
      groups.push({
        key,
        items: [...arr].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")),
        location: first.location,
        name: first.name,
      });
    }

    // stable-ish: by location then name
    groups.sort((a, b) => {
      const lc = (a.location || "").localeCompare(b.location || "");
      if (lc !== 0) return lc;
      return (a.name || "").localeCompare(b.name || "");
    });

    return groups;
  }, [items]);

  const duplicateStats = useMemo(() => {
    const groupCount = duplicateGroups.length;
    let itemCount = 0;
    for (const g of duplicateGroups) itemCount += g.items.length;
    return { groupCount, itemCount };
  }, [duplicateGroups]);

  const mergeableGroupKeySet = useMemo(() => {
    const set = new Set<string>();
    for (const g of duplicateGroups) {
      if (canMergeGroup(g.items).ok) set.add(g.key);
    }
    return set;
  }, [duplicateGroups]);

  function openDuplicateModalForKey(key: string) {
    setDupeError("");
    setDupeModalKey(key);
    setDupeModalOpen(true);

    const g = duplicateGroups.find((x) => x.key === key);
    const defaultKeep = g?.items?.[0]?.id || "";
    setDupeKeepId(defaultKeep);
  }

  function closeDuplicateModal() {
    setDupeModalOpen(false);
    setDupeModalKey(null);
    setDupeKeepId("");
    setDupeBusy(false);
    setDupeError("");
  }

  function reviewAllDuplicates() {
    if (duplicateGroups.length === 0) return;
    setActiveFilter("duplicates");
    openDuplicateModalForKey(duplicateGroups[0].key);
  }

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
      case "duplicates":
        return items.filter((i) => (duplicateCountById.get(i.id) ?? 0) > 1);
      default:
        return items;
    }
  }, [items, activeFilter, soonishAll, expiredItems, duplicateCountById]);
  const visibleItems = useMemo(() => (hideOutItems ? filtered.filter((i) => !isOut(i)) : filtered), [filtered, hideOutItems]);
  const filteredIds = useMemo(() => visibleItems.map((i) => i.id), [visibleItems]);
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

      if (editId === id) {
        setEditDraft((prev) => (prev ? { ...prev, quantity: nextQty } : prev));
      }
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

      if (editId === id) {
        setEditId(null);
        setEditDraft(null);
        setEditUseByAuto(false);
      }
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

        if (editId && succeeded.includes(editId)) {
          setEditId(null);
          setEditDraft(null);
          setEditUseByAuto(false);
        }
      }

      if (failed.length > 0) {
        setErrorMsg(`Some deletes failed: ${failed.slice(0, 3).join("  -  ")}${failed.length > 3 ? " ..." : ""}`);
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

      setAddName("");
      setAddQty(1);
      setAddUnit("bag");
      const nextStored = todayAsDateInput();
      setAddStoredOn(nextStored);

      const computed = computeDefaultUseBy(addLocation, nextStored, "", true);
      setAddUseBy(computed.use_by);
      setAddUseByAuto(computed.useByAuto);

      setAddPanel("none");
      setAddOptionsOpen(false);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Failed to add item");
    } finally {
      setAddBusy(false);
    }
  }

  function openPanel(next: AddPanel) {
    setErrorMsg("");
    setAddPanel((prev) => (prev === next ? "none" : next));

    if (next === "type") {
      const baseStored = addStoredOn || todayAsDateInput();
      const computed = computeDefaultUseBy(addLocation, baseStored, addUseBy, addUseByAuto);
      setAddUseBy(computed.use_by);
      setAddUseByAuto(computed.useByAuto);
    }
  }

  function startInlineEdit(item: StorageItem) {
    setErrorMsg("");
    setEditId(item.id);
    const draft = makeDraftFromItem(item);
    setEditDraft(draft);

    const initialAuto = !draft.use_by?.trim();
    setEditUseByAuto(initialAuto);

    if (initialAuto) {
      const stored = draft.stored_on || todayAsDateInput();
      const computed = computeDefaultUseBy(draft.location, stored, "", true);
      setEditDraft((prev) =>
        prev
          ? {
              ...prev,
              stored_on: stored,
              use_by: computed.use_by,
            }
          : prev
      );
    }
  }

  function cancelInlineEdit() {
    setEditId(null);
    setEditDraft(null);
    setEditUseByAuto(false);
  }

  async function saveInlineEdit(id: string) {
    if (!editDraft) return;

    const name = editDraft.name.trim();
    if (!name) {
      setErrorMsg("Name can't be empty.");
      return;
    }

    setEditBusy(true);
    setErrorMsg("");

    try {
      const payload = {
        name,
        location: editDraft.location,
        quantity: Math.max(0, Number(editDraft.quantity) || 0),
        unit: editDraft.unit.trim() || "unit",
        stored_on: editDraft.stored_on?.trim() ? editDraft.stored_on.trim() : null,
        use_by: editDraft.use_by?.trim() ? editDraft.use_by.trim() : null,
        notes: editDraft.notes?.trim() ? editDraft.notes.trim() : null,
        is_leftover: Boolean(editDraft.is_leftover),
      };

      const res = await fetch(`/api/storage-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || (json && json.ok === false)) throw new Error(json?.error || "Failed to update item");

      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...payload } : it)));

      cancelInlineEdit();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message ?? "Failed to update item");
    } finally {
      setEditBusy(false);
    }
  }

  async function mergeDuplicateGroup(groupKey: string, keepId: string) {
    const group = duplicateGroups.find((g) => g.key === groupKey);
    if (!group) return;

    const groupItems = group.items;
    const keep = groupItems.find((x) => x.id === keepId) ?? groupItems[0];
    const others = groupItems.filter((x) => x.id !== keep.id);

    const eligibility = canMergeGroup(groupItems);
    if (!eligibility.ok) {
      setDupeError(`Can't merge: ${eligibility.reason}`);
      return;
    }

    const total = groupItems.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

    setDupeBusy(true);
    setDupeError("");

    try {
      // 1) Update kept item's quantity
      {
        const res = await fetch(`/api/storage-items/${keep.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: total }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || (json && json.ok === false)) throw new Error(json?.error || "Failed to update kept item");
      }

      // 2) Delete others (best-effort)
      const results = await Promise.allSettled(
        others.map(async (it) => {
          const res = await fetch(`/api/storage-items/${it.id}`, { method: "DELETE" });
          const json = await res.json().catch(() => null);
          if (!res.ok || (json && json.ok === false)) throw new Error(json?.error || `Failed to delete ${it.id}`);
          return it.id;
        })
      );

      const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      if (failed.length > 0) {
        setDupeError(
          `Merged quantity, but some deletes failed: ${failed
            .slice(0, 2)
            .map((f) => String((f.reason as any)?.message || "unknown error"))
            .join("  -  ")}${failed.length > 2 ? " ..." : ""}`
        );
      }

      await loadItems();
      closeDuplicateModal();
    } catch (e: any) {
      console.error(e);
      setDupeError(e?.message ?? "Merge failed");
    } finally {
      setDupeBusy(false);
    }
  }

  /* =========================
     Header / Hero
  ========================= */

  const tealPill =
    "rounded-full bg-emerald-500/0 hover:bg-emerald-500/10 px-5 py-3 text-sm font-semibold ring-1 ring-white/10 text-white/85 transition";
  const tealPillActive =
    "rounded-full bg-emerald-500/20 hover:bg-emerald-500/25 px-5 py-3 text-sm font-extrabold ring-1 ring-white/10 text-white transition";

  const addBtn =
    "rounded-full bg-white/10 hover:bg-white/15 px-5 py-3 text-sm font-semibold ring-1 ring-white/10 text-white/90 transition";
  const popItem =
    "w-full text-left rounded-xl px-4 py-3 text-sm font-semibold text-white/90 hover:bg-white/10 transition";

  const heroChaos = [
    { id: "jar", emoji: "🫙" },
    { id: "milk", emoji: "🥛" },
    { id: "box", emoji: "📦" },
    { id: "cheese", emoji: "🧀" },
    { id: "can", emoji: "🥫" },
    { id: "spark1", emoji: "*" },
    { id: "spark2", emoji: "*" },
    { id: "ice", emoji: "🧊" },
    { id: "tag", emoji: "🏷️" },
    { id: "bowl", emoji: "🥣" },
    { id: "bread", emoji: "🍞" },
    { id: "apple", emoji: "🍎" },
  ];

  const header = (
    <div className="mt-2">
      <RcPageHero
        title="Pantry & Freezer"
        tagline="lets see what you got"
        chaos={heroChaos}
        height={310}
        rightSlot={
          <div className="flex items-center gap-2">
            <div className="relative" ref={addOptionsRef}>
              <button
                type="button"
                className={addBtn}
                onClick={() => setAddOptionsOpen((v) => !v)}
                aria-expanded={addOptionsOpen}
              >
                Add
              </button>

              {addOptionsOpen ? (
                <div className="absolute right-0 mt-2 w-[220px] rounded-2xl bg-[#0b1026]/95 ring-1 ring-white/10 shadow-xl p-2 z-50">
                  <button type="button" className={popItem} onClick={() => openPanel("type")}>
                    Type It
                  </button>
                  <button type="button" className={popItem} onClick={() => openPanel("paste")}>
                    Paste It
                  </button>
                  <button type="button" className={popItem} onClick={() => openPanel("upload")}>
                    Upload It
                  </button>

                  <div className="mt-2 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      className={popItem}
                      onClick={() => {
                        setAddPanel("none");
                        setAddOptionsOpen(false);
                      }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        }
      />

      <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
        <FilterPill label="All" active={activeFilter === "all"} onClick={() => setActiveFilter("all")} base={tealPill} activeCls={tealPillActive} />
        <FilterPill label="Use Soon-ish" active={activeFilter === "soonish"} onClick={() => setActiveFilter("soonish")} base={tealPill} activeCls={tealPillActive} />
        <FilterPill label="Leftovers" active={activeFilter === "leftovers"} onClick={() => setActiveFilter("leftovers")} base={tealPill} activeCls={tealPillActive} />
        <FilterPill label="Freezer" active={activeFilter === "freezer"} onClick={() => setActiveFilter("freezer")} base={tealPill} activeCls={tealPillActive} />
        <FilterPill label="Fridge" active={activeFilter === "fridge"} onClick={() => setActiveFilter("fridge")} base={tealPill} activeCls={tealPillActive} />
        <FilterPill label="Pantry" active={activeFilter === "pantry"} onClick={() => setActiveFilter("pantry")} base={tealPill} activeCls={tealPillActive} />

        <button
          type="button"
          onClick={() => setActiveFilter("duplicates")}
          disabled={duplicateStats.groupCount === 0}
          className={[
            activeFilter === "duplicates" ? tealPillActive : tealPill,
            duplicateStats.groupCount === 0 ? "opacity-50 cursor-not-allowed" : "",
          ].join(" ")}
          title={duplicateStats.groupCount === 0 ? "No duplicates found" : `${duplicateStats.groupCount} duplicate group(s)`}
        >
          Duplicates
          {duplicateStats.groupCount > 0 ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-extrabold ring-1 ring-white/10">
              {duplicateStats.groupCount}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );

  /* =========================
     Render
  ========================= */

  const fieldLabel = "text-xs text-white/55";
  const input =
    "w-full rounded-2xl bg-white/5 text-white placeholder:text-white/35 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-400/40";
  const select =
    "w-full rounded-2xl bg-[#0b1026] text-white ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-400/40";

  const iconBtn = "inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white transition";
  const iconBtnDisabled = "opacity-50 pointer-events-none";

  // "Inline duplicate UI" only appears when the Duplicates tab is active.
  const showDuplicateInlineUi = activeFilter === "duplicates";

  const modalGroup = useMemo(() => {
    if (!dupeModalKey) return null;
    return duplicateGroups.find((g) => g.key === dupeModalKey) ?? null;
  }, [dupeModalKey, duplicateGroups]);

  const modalEligibility = useMemo(() => {
    if (!modalGroup) return { ok: false, reason: "" };
    return canMergeGroup(modalGroup.items);
  }, [modalGroup]);

  // Light banner only when user is *not* in duplicates view (keeps it from doubling up)
  const dupBannerVisible = duplicateStats.groupCount > 0 && addPanel === "none" && activeFilter !== "duplicates";

  return (
    <RcPageShell header={header}>
      {/* Duplicate review modal */}
      {dupeModalOpen && modalGroup ? (
        <div className="fixed inset-0 z-[999]">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              if (dupeBusy) return;
              closeDuplicateModal();
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-3xl bg-[#0b1026] ring-1 ring-white/10 shadow-2xl p-6 text-white">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
                    <span>Duplicates</span>
                    <span className="text-white/60 text-sm font-semibold">({modalGroup.items.length})</span>
                  </div>
                  <div className="mt-1 text-sm text-white/60">Review first. Merge only when it's truly the same thing.</div>
                </div>

                <button
                  type="button"
                  onClick={closeDuplicateModal}
                  disabled={dupeBusy}
                  className="rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2 font-semibold disabled:opacity-50"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
                <div className="text-sm font-bold text-white/90">Group</div>
                <div className="mt-1 text-sm text-white/70">
                  <span className="font-semibold text-white/85">{modalGroup.name}</span>{" "}
                  <span className="text-white/45"> - </span>{" "}
                  <span className="text-white/70">{modalGroup.location}</span>
                </div>

                <div className="mt-3 grid gap-3">
                  {modalGroup.items.map((it) => (
                    <div
                      key={it.id}
                      className="rounded-2xl bg-black/20 ring-1 ring-white/10 p-4 flex items-start justify-between gap-3 flex-wrap"
                    >
                      <div className="min-w-0">
                        <div className="font-extrabold tracking-tight text-white/95">
                          {it.quantity} {it.unit}
                        </div>
                        <div className="mt-1 text-xs text-white/55">
                          {prettyDateShort(it.stored_on) ? `stored ${prettyDateShort(it.stored_on)}` : ""}
                          {it.use_by ? `  -  use by ${prettyDateShort(it.use_by)}` : ""}
                          {it.is_leftover ? "  -  leftover" : ""}
                        </div>
                        {it.notes ? <div className="mt-2 text-xs text-white/50">{it.notes}</div> : null}
                        <div className="mt-2 text-[11px] text-white/35 break-all">id: {it.id}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDupeKeepId(it.id)}
                          disabled={dupeBusy}
                          className={[
                            "rounded-2xl px-4 py-2 text-sm font-extrabold ring-1 transition",
                            dupeKeepId === it.id
                              ? "bg-[rgba(34,211,238,0.25)] ring-[rgba(34,211,238,0.65)] text-white"
                              : "bg-white/10 hover:bg-white/15 ring-white/10 text-white/85",
                            dupeBusy ? "opacity-60" : "",
                          ].join(" ")}
                          title="Keep this one"
                        >
                          {dupeKeepId === it.id ? "Kept" : "Keep"}
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteItem(it.id)}
                          disabled={dupeBusy}
                          className="rounded-2xl bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-semibold disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-start justify-between gap-3 flex-wrap">
                  <div className="text-xs text-white/55">
                    {modalEligibility.ok ? (
                      <span>Merge available (same unit, dates, notes, leftover flag).</span>
                    ) : (
                      <span>
                        Merge disabled: <span className="text-white/70 font-semibold">{modalEligibility.reason}</span>
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={dupeBusy || !modalEligibility.ok || !dupeKeepId}
                    onClick={() => {
                      const ok = confirm(
                        `Merge ${modalGroup.items.length} items into 1?\n\nThis will sum quantities and delete the others.`
                      );
                      if (!ok) return;
                      mergeDuplicateGroup(modalGroup.key, dupeKeepId);
                    }}
                    className="rounded-2xl bg-[rgba(34,211,238,0.85)] hover:bg-[rgba(34,211,238,0.95)] px-5 py-3 font-extrabold text-black disabled:opacity-50 shadow-lg shadow-cyan-500/10"
                  >
                    {dupeBusy ? "Merging..." : "Merge"}
                  </button>
                </div>

                {dupeError ? (
                  <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-red-100 text-sm">
                    {dupeError}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 text-xs text-white/45">
                Tip: if these look similar-but-not-the-same, keep them separate. The chip is a heads-up, not a mandate.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Type It */}
      {addPanel === "type" ? (
        <div className="mt-8 rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-2xl font-extrabold tracking-tight text-white">Type It</div>
              <div className="mt-1 text-sm text-white/60">Quick add an item.</div>
            </div>
          </div>

          <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Item name"
                className="w-[320px] rounded-2xl bg-white/5 text-white placeholder:text-white/35 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-400/40"
                autoFocus
              />

              <select
                value={addLocation}
                onChange={(e) => setAddLocation(e.target.value as Location)}
                className="w-[180px] rounded-2xl bg-[#0b1026] text-white ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-400/40"
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
                className="w-[120px] rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-400/40"
              />

              <input
                value={addUnit}
                onChange={(e) => setAddUnit(e.target.value)}
                placeholder="unit"
                className="w-[160px] rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-400/40"
              />
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-xs text-white/50">Stored on</div>
                <input
                  type="date"
                  value={addStoredOn}
                  onChange={(e) => setAddStoredOn(e.target.value)}
                  className="w-[220px] rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-400/40"
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
                    setAddUseByAuto(next.trim() === "");
                  }}
                  className="w-[220px] rounded-2xl bg-white/5 text-white ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-400/40"
                />
              </div>

              <div className="text-xs text-white/45 pb-2">
                Defaults: Fridge 30d  -  Pantry/Freezer 6mo
                {!addUseByAuto ? <span className="text-white/40">  -  manual</span> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setAddPanel("none")}
                className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3 text-white/90"
              >
                Never mind
              </button>

              <button
                type="submit"
                disabled={addBusy || !addName.trim()}
                className="rounded-2xl bg-emerald-400/80 hover:bg-emerald-400 px-5 py-3 font-semibold text-black disabled:opacity-50 shadow-lg shadow-emerald-400/10"
              >
                {addBusy ? "Saving..." : "Add item"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Paste It */}
      {addPanel === "paste" ? (
        <div className="mt-8 rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
          <div className="text-2xl font-extrabold tracking-tight text-white">Paste It</div>
          <div className="mt-1 text-sm text-white/60">Paste receipt text. Review first. Add only what you want.</div>

          <div className="mt-5">
            <ReceiptScanTool
              forcedMode="paste"
              embedded
              onDone={async () => {
                await loadItems();
                setAddPanel("none");
                setAddOptionsOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Upload It */}
      {addPanel === "upload" ? (
        <div className="mt-8 rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
          <div className="text-2xl font-extrabold tracking-tight text-white">Upload It</div>
          <div className="mt-1 text-sm text-white/60">Upload a receipt file. Review first. Add only what you want.</div>

          <div className="mt-5">
            <ReceiptScanTool
              forcedMode="upload"
              embedded
              onDone={async () => {
                await loadItems();
                setAddPanel("none");
                setAddOptionsOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Error */}
      {addPanel === "none" && errorMsg ? (
        <div className="mt-8 rounded-xl border border-red-500/30 bg-red-950/40 px-5 py-4 text-red-100">{errorMsg}</div>
      ) : null}

      {/* Duplicate banner (single button: Review all) */}
      {dupBannerVisible ? (
        <div className="mt-8 rounded-3xl bg-white/5 ring-1 ring-white/10 p-5 text-white">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-extrabold tracking-tight">
                Duplicates found{" "}
                <span className="text-white/60 font-semibold">
                  ({duplicateStats.groupCount} group{duplicateStats.groupCount === 1 ? "" : "s"})
                </span>
              </div>
              <div className="mt-1 text-xs text-white/55">Not a problem. Just a heads-up. Review if you want.</div>
            </div>

            <button
              type="button"
              onClick={reviewAllDuplicates}
              disabled={duplicateGroups.length === 0}
              className="rounded-2xl bg-[rgba(34,211,238,0.85)] hover:bg-[rgba(34,211,238,0.95)] px-4 py-2 text-sm font-extrabold text-black disabled:opacity-50 ring-1 ring-white/10"
              title="Review duplicates"
            >
              Review all
            </button>
          </div>
        </div>
      ) : null}

      {/* Use Soon-ish */}
      {soonishMain.length > 0 ? (
        <div className="mt-8 rounded-3xl bg-white/5 ring-1 ring-white/10 p-6 text-white">
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
        <div className="mt-3 rounded-3xl bg-white/5 ring-1 ring-white/10 p-4 text-white">
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
      <div className="mt-8 rounded-3xl bg-white/5 ring-1 ring-white/10 p-5 text-white">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-white/60">
            Showing <span className="text-white/80 font-semibold">{visibleItems.length}</span> item
            {visibleItems.length === 1 ? "" : "s"}.
            {activeFilter === "duplicates" ? <span className="ml-2 text-white/45">(duplicates view)</span> : null}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="rounded-full bg-white/6 ring-1 ring-white/10 px-4 py-2 text-sm text-white/75">
              Shop day:{" "}
              <select
                value={shopDay}
                onChange={(e) => setShopDay(e.target.value)}
                className="bg-transparent outline-none text-white/90 font-semibold"
              >
                <option className="bg-[#0b1026]" value="Sunday">
                  Sunday
                </option>
                <option className="bg-[#0b1026]" value="Monday">
                  Monday
                </option>
                <option className="bg-[#0b1026]" value="Tuesday">
                  Tuesday
                </option>
                <option className="bg-[#0b1026]" value="Wednesday">
                  Wednesday
                </option>
                <option className="bg-[#0b1026]" value="Thursday">
                  Thursday
                </option>
                <option className="bg-[#0b1026]" value="Friday">
                  Friday
                </option>
                <option className="bg-[#0b1026]" value="Saturday">
                  Saturday
                </option>
              </select>
            </div>

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
                {bulkBusy ? "Deleting..." : `Delete selected (${selectionCount})`}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Main list */}
      {loading ? (
        <div className="mt-8 text-white/70">Loading...</div>
      ) : visibleItems.length === 0 ? (
        <div className="mt-8 text-white/55">
          <div className="font-semibold text-white/70">
            {activeFilter === "duplicates" ? "No duplicates right now." : "Nothing here yet."}
          </div>
          <div className="mt-1 text-sm text-white/50">
            {activeFilter === "duplicates"
              ? "Your pantry is behaving. Suspicious."
              : "Add an item when you feel like it. Yes, even the mystery rice from 2014."}
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-6">
          {visibleItems.map((item) => {
            const checked = selectedSet.has(item.id);
            const expired = isExpired(item);
            const isEditing = editId === item.id;

            // Duplicate UI: only when duplicates tab is active
            const dupCount = duplicateCountById.get(item.id) ?? 0;
            const isDuplicateRow = showDuplicateInlineUi && dupCount > 1;
            const itemGroupKey = isDuplicateRow ? dupeKeyForItem(item) : null;
            const mergeReady = Boolean(itemGroupKey && mergeableGroupKeySet.has(itemGroupKey));

            return (
              <div key={item.id} className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10 text-white">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-4">
                    <label className="flex items-center gap-2 pt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelected(item.id)}
                        className="h-4 w-4 accent-emerald-400"
                      />
                    </label>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-2xl font-extrabold tracking-tight">{item.name}</div>

                        {isDuplicateRow ? (
                          <>
                            {mergeReady ? <Chip text="Merge ready" tone="duplicate" /> : <Chip text="Review" tone="duplicate" />}
                            <button
                              type="button"
                              onClick={() => itemGroupKey && openDuplicateModalForKey(itemGroupKey)}
                              className="rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm font-extrabold ring-1 ring-white/10"
                              title="Review this duplicate group"
                            >
                              Review
                            </button>
                          </>
                        ) : null}

                        {isOut(item) ? <Chip text="Out" tone="out" /> : null}
                        {expired ? <Chip text="Expired" tone="expired" /> : null}
                        {item.is_leftover ? <Chip text="Leftover" /> : null}

                        <Chip text={item.location} />
                      </div>

                      <div className="mt-2 text-white/55 text-sm">
                        {prettyDateShort(item.stored_on) ? `stored ${prettyDateShort(item.stored_on)}` : ""}
                        {item.use_by ? `  -  use by ${prettyDateShort(item.use_by)}` : ""}
                      </div>

                      {item.notes ? <div className="mt-2 text-white/50 text-sm">{item.notes}</div> : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2"
                        disabled={busyId === item.id || bulkBusy || editBusy}
                        onClick={() => changeQuantity(item.id, -1)}
                        type="button"
                      >
                        "
                      </button>

                      <div className="min-w-[120px] text-center font-semibold text-white/85">
                        {item.quantity} {item.unit}
                      </div>

                      <button
                        className="rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2"
                        disabled={busyId === item.id || bulkBusy || editBusy}
                        onClick={() => changeQuantity(item.id, +1)}
                        type="button"
                      >
                        +
                      </button>
                    </div>

                    {/* Icon-only edit */}
                    <button
                      type="button"
                      onClick={() => (isEditing ? cancelInlineEdit() : startInlineEdit(item))}
                      className={[iconBtn, bulkBusy || editBusy || busyId === item.id ? iconBtnDisabled : ""].join(" ")}
                      disabled={bulkBusy || editBusy || busyId === item.id}
                      title={isEditing ? "Close edit" : "Edit inline"}
                      aria-label={isEditing ? "Close edit" : "Edit inline"}
                    >
                      <span className="text-xl leading-none">{isEditing ? "Close" : "Edit"}</span>
                    </button>

                    {/* Icon-only delete */}
                    <button
                      className={[
                        iconBtn,
                        "text-red-200 hover:text-red-100",
                        busyId === item.id || bulkBusy || editBusy ? iconBtnDisabled : "",
                      ].join(" ")}
                      disabled={busyId === item.id || bulkBusy || editBusy}
                      onClick={() => deleteItem(item.id)}
                      type="button"
                      title="Delete"
                      aria-label="Delete"
                    >
                      <span className="text-xl leading-none">💣</span>
                    </button>
                  </div>
                </div>

                {/* Inline edit panel */}
                {isEditing && editDraft ? (
                  <div className="mt-6 rounded-3xl bg-black/20 ring-1 ring-white/10 p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-lg font-extrabold tracking-tight">Edit item</div>
                        <div className="mt-1 text-sm text-white/60">Inline, on purpose. No teleporting to another page.</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={cancelInlineEdit}
                          disabled={editBusy}
                          className="rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveInlineEdit(item.id)}
                          disabled={editBusy || !editDraft.name.trim()}
                          className="rounded-2xl bg-emerald-400/80 hover:bg-emerald-400 px-4 py-2 text-sm font-extrabold text-black disabled:opacity-50 shadow-lg shadow-emerald-400/10"
                        >
                          {editBusy ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <div className={fieldLabel}>Name</div>
                        <input
                          value={editDraft.name}
                          onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                          className={input}
                          placeholder="Item name"
                        />
                      </div>

                      <div>
                        <div className={fieldLabel}>Location</div>
                        <select
                          value={editDraft.location}
                          onChange={(e) =>
                            setEditDraft((prev) => (prev ? { ...prev, location: e.target.value as Location } : prev))
                          }
                          className={select}
                        >
                          <option value="Freezer">Freezer</option>
                          <option value="Fridge">Fridge</option>
                          <option value="Pantry">Pantry</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className={fieldLabel}>Quantity</div>
                          <input
                            type="number"
                            min={0}
                            value={editDraft.quantity}
                            onChange={(e) =>
                              setEditDraft((prev) =>
                                prev ? { ...prev, quantity: Math.max(0, Number(e.target.value) || 0) } : prev
                              )
                            }
                            className={input}
                          />
                        </div>

                        <div>
                          <div className={fieldLabel}>Unit</div>
                          <input
                            value={editDraft.unit}
                            onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, unit: e.target.value } : prev))}
                            className={input}
                            placeholder="bag, jar, box..."
                          />
                        </div>
                      </div>

                      <div>
                        <div className={fieldLabel}>Stored on</div>
                        <input
                          type="date"
                          value={editDraft.stored_on || ""}
                          onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, stored_on: e.target.value } : prev))}
                          className={input}
                        />
                      </div>

                      <div>
                        <div className={fieldLabel}>Use by</div>
                        <input
                          type="date"
                          value={editDraft.use_by || ""}
                          onChange={(e) => {
                            const next = e.target.value;
                            setEditDraft((prev) => (prev ? { ...prev, use_by: next } : prev));
                            setEditUseByAuto(next.trim() === "");
                          }}
                          className={input}
                        />
                        <div className="mt-1 text-xs text-white/45">
                          Defaults: Fridge 30d  -  Pantry/Freezer 6mo
                          {!editUseByAuto ? <span className="text-white/40">  -  manual</span> : null}
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="inline-flex items-center gap-2 text-sm text-white/80">
                          <input
                            type="checkbox"
                            checked={Boolean(editDraft.is_leftover)}
                            onChange={(e) =>
                              setEditDraft((prev) => (prev ? { ...prev, is_leftover: e.target.checked } : prev))
                            }
                            className="h-4 w-4 accent-emerald-400"
                          />
                          Leftover
                        </label>
                      </div>

                      <div className="md:col-span-2">
                        <div className={fieldLabel}>Notes</div>
                        <input
                          value={editDraft.notes}
                          onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, notes: e.target.value } : prev))}
                          className={input}
                          placeholder="Optional notes..."
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </RcPageShell>
  );
}

/* ========================= */

function FilterPill({
  label,
  active,
  onClick,
  base,
  activeCls,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  base: string;
  activeCls: string;
}) {
  return (
    <button type="button" onClick={onClick} className={active ? activeCls : base}>
      {label}
    </button>
  );
}








