// app/shopping-list/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  categorizeItemName,
  type ShoppingCategory,
} from "@/lib/shoppingListCategories";

type Item = {
  id: string;
  user_id: string | null;
  name: string;
  normalized_name: string;
  source_type: string;
  source_recipe_id: string | null;
  source_recipe_title?: string | null;
  source_recipe_name?: string | null;
  checked: boolean;
  dismissed: boolean;
};

type Group = {
  key: string;
  display: string;
  category: ShoppingCategory;
  items: Item[];
};

const CATEGORY_ORDER: ShoppingCategory[] = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Frozen",
  "Pantry",
  "Spices & Baking",
  "Snacks",
  "Beverages",
  "Household",
  "Other",
];

// ---------- display cleaning ----------
function normalizeFractionChars(raw: string): string {
  return (raw || "")
    .replace(/[\u2044\u2215\uFF0F]/g, "/") // ⁄ ∕ ／
    .replace(/\u00BC/g, " 1/4 ") // ¼
    .replace(/\u00BD/g, " 1/2 ") // ½
    .replace(/\u00BE/g, " 3/4 ") // ¾
    .replace(/\u2153/g, " 1/3 ") // ⅓
    .replace(/\u2154/g, " 2/3 ") // ⅔
    .replace(/\u215B/g, " 1/8 ") // ⅛
    .replace(/\u215C/g, " 3/8 ") // ⅜
    .replace(/\u215D/g, " 5/8 ") // ⅝
    .replace(/\u215E/g, " 7/8 "); // ⅞
}

function stripLeadingMeasurement(raw: string): string {
  let s = normalizeFractionChars(raw).trim();
  if (!s) return s;

  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[-•*]+\s*/, "").trim();

  s = s.replace(/^\d+\s+\d+\/\d+\s*/, "");
  s = s.replace(/^\d+\/\d+\s*/, "");
  s = s.replace(/^\d+(\.\d+)?\s*/, "");

  s = s.replace(/^of\s+/i, "").trim();

  const unitPattern =
    /^(cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|ml|l|liter|litre|liters|litres|pinch|dash|clove|cloves|slice|slices|can|cans|package|packages|packet|packets)\b\.?\s*/i;

  if (unitPattern.test(s)) {
    s = s.replace(unitPattern, "").trim();
  }

  s = s.replace(/^(pinch|dash)\s+of\s+/i, "").trim();
  s = s.replace(/^\/\d+\s*/, "").trim();

  return s || normalizeFractionChars(raw).trim();
}

function stripTrailingNotes(display: string): string {
  let s = (display || "").trim();
  if (!s) return s;

  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return s;

  const first = parts[0];
  const rest = parts.slice(1).join(", ").toLowerCase();

  const removable = [
    "divided",
    "melted",
    "softened",
    "room temperature",
    "to taste",
    "or to taste",
    "more to taste",
    "or more to taste",
    "as needed",
    "for serving",
    "for garnish",
    "optional",
    "chopped",
    "diced",
    "minced",
    "sliced",
    "grated",
    "shredded",
    "peeled",
    "seeded",
    "ground",
    "crushed",
    "drained",
    "rinsed",
    "fresh",
    "packed",
    "warm",
    "cold",
  ];

  const shouldStrip =
    removable.some((p) => rest.includes(p)) || rest.split(" ").length <= 4;
  return shouldStrip ? first : s;
}

function displayBaseName(raw: string) {
  const noMeasure = stripLeadingMeasurement(raw);
  const noNotes = stripTrailingNotes(noMeasure);
  return noNotes.trim() || (raw || "").trim();
}

function recipeLabelForItem(it: Item): string {
  return (
    (it.source_recipe_title ?? it.source_recipe_name ?? null) ||
    (it.source_recipe_id ? "Recipe" : "") ||
    ""
  );
}

export default function ShoppingListPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [showDismissed, setShowDismissed] = useState(false);
  const [newItemName, setNewItemName] = useState("");

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {}
  );

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/shopping-list/items", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to load shopping list");
      setItems(Array.isArray(json?.items) ? (json.items as Item[]) : []);
    } catch (e: any) {
      alert(e?.message || "Load error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function patchItem(
    id: string,
    patch: Partial<Pick<Item, "checked" | "dismissed">>
  ) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? ({ ...it, ...patch } as Item) : it))
    );

    const res = await fetch(`/api/shopping-list/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      await load();
      alert(json?.error || "Update failed");
      return;
    }

    if (json?.item) {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? (json.item as Item) : it))
      );
    }
  }

  async function patchMany(
    ids: string[],
    patch: Partial<Pick<Item, "checked" | "dismissed">>
  ) {
    if (ids.length === 0) return;

    setItems((prev) =>
      prev.map((it) => (ids.includes(it.id) ? ({ ...it, ...patch } as Item) : it))
    );

    const results = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`/api/shopping-list/items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = await res.json().catch(() => null);
        return { id, ok: res.ok, item: json?.item, error: json?.error };
      })
    );

    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      await load();
      alert(
        `Some items failed to update (${failures.length}).\n` +
          (failures[0].error || "Unknown error")
      );
      return;
    }

    setItems((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      for (const r of results) {
        if (r.item?.id) map.set(r.item.id, r.item as Item);
      }
      return Array.from(map.values());
    });
  }

  async function addManual() {
    const name = newItemName.trim();
    if (!name) return;

    setStatus("Adding…");
    try {
      const res = await fetch("/api/shopping-list/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Add failed");

      if (json?.item) {
        setItems((prev) => [json.item as Item, ...prev]);
        setStatus("Added ✅");
      } else if (json?.note) {
        setStatus(String(json.note));
      } else {
        setStatus("Done");
      }

      setNewItemName("");
      window.setTimeout(() => setStatus(""), 1200);
    } catch (e: any) {
      alert(e?.message || "Add error");
      setStatus("");
    }
  }

  async function clearChecked() {
    const ids = items.filter((i) => i.checked && !i.dismissed).map((i) => i.id);
    if (ids.length === 0) return;
    if (!confirm(`Clear ${ids.length} checked items?`)) return;

    setStatus("Clearing…");
    await patchMany(ids, { dismissed: true });
    setStatus("");
  }

  async function clearAll() {
    const ids = items.filter((i) => !i.dismissed).map((i) => i.id);
    if (ids.length === 0) return;
    if (!confirm(`Clear ALL (${ids.length}) items?`)) return;

    setStatus("Clearing…");
    await patchMany(ids, { dismissed: true });
    setStatus("");
  }

  const visibleItems = useMemo(
    () => items.filter((it) => (showDismissed ? true : !it.dismissed)),
    [items, showDismissed]
  );

  const groupedByCategory = useMemo(() => {
    const groupMap = new Map<string, Item[]>();

    for (const it of visibleItems) {
      const base = displayBaseName(it.name).toLowerCase();
      if (!base) continue;
      const arr = groupMap.get(base) || [];
      arr.push(it);
      groupMap.set(base, arr);
    }

    const groups: Group[] = [];
    for (const [baseLower, list] of groupMap.entries()) {
      const display = displayBaseName(list[0].name);
      const category = categorizeItemName(display);
      groups.push({ key: baseLower, display, category, items: list.slice() });
    }

    const catMap = new Map<ShoppingCategory, Group[]>();
    for (const c of CATEGORY_ORDER) catMap.set(c, []);
    for (const g of groups) catMap.get(g.category)!.push(g);

    for (const c of CATEGORY_ORDER) {
      catMap.set(
        c,
        (catMap.get(c) || [])
          .slice()
          .map((g) => {
            g.items = g.items
              .slice()
              .sort((a, b) => {
                if (a.checked !== b.checked) return a.checked ? 1 : -1;
                return a.name.localeCompare(b.name);
              });
            return g;
          })
          .sort((a, b) => {
            const aAllChecked = a.items.every((i) => i.checked);
            const bAllChecked = b.items.every((i) => i.checked);
            if (aAllChecked !== bAllChecked) return aAllChecked ? 1 : -1;
            return a.display.localeCompare(b.display);
          })
      );
    }

    return catMap;
  }, [visibleItems]);

  const totalCount = visibleItems.length;
  const checkedCount = visibleItems.filter((i) => i.checked).length;

  const hasAnyItems = items.length > 0;
  const everythingHidden =
    !loading && hasAnyItems && !showDismissed && visibleItems.length === 0;

  return (
    <div className="rc-container">
      <div
        className="rc-row"
        style={{
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 54, margin: 0, letterSpacing: -0.7 }}>
            Shopping List
          </h1>
          <div className="rc-subtle" style={{ marginTop: 10 }}>
            Items: <b>{totalCount}</b> • Checked: <b>{checkedCount}</b>
            {status ? <span style={{ marginLeft: 10 }}>• {status}</span> : null}
          </div>
          <div className="rc-tiny" style={{ marginTop: 8 }}>
            Checkbox sits beside the item. Details shows which recipe it came
            from.
          </div>
        </div>

        <div className="rc-row" style={{ flexWrap: "wrap" }}>
          <Link href="/meal-planning" className="rc-btn">
            ← Meal Planning
          </Link>

          <label
            className="rc-row"
            style={{ gap: 8, opacity: 0.9, alignItems: "center" }}
          >
            <input
              type="checkbox"
              checked={showDismissed}
              onChange={(e) => setShowDismissed(e.target.checked)}
              style={{ margin: 0 }}
            />
            Show dismissed
          </label>

          <button onClick={load} className="rc-btn">
            Refresh
          </button>
          <button onClick={clearChecked} className="rc-btn">
            Clear checked
          </button>
          <button onClick={clearAll} className="rc-btn">
            Clear all
          </button>
        </div>
      </div>

      <div className="rc-row" style={{ marginTop: 16, gap: 10 }}>
        <input
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Add item… (e.g., milk)"
          className="rc-input"
          onKeyDown={(e) => {
            if (e.key === "Enter") addManual();
          }}
          style={{ flex: 1, minWidth: 260 }}
        />
        <button onClick={addManual} className="rc-btn rc-btn-dark">
          Add
        </button>
      </div>

      {loading ? (
        <div style={{ marginTop: 18, opacity: 0.8 }}>Loading…</div>
      ) : (
        <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
          {everythingHidden ? (
            <div className="rc-panel" style={{ opacity: 0.9 }}>
              Everything is currently dismissed. If you want to see what’s in the
              archive, toggle <b>Show dismissed</b>.
              <div style={{ marginTop: 10 }}>
                <button
                  className="rc-btn"
                  onClick={() => setShowDismissed(true)}
                >
                  Show dismissed
                </button>
              </div>
            </div>
          ) : null}

          {CATEGORY_ORDER.map((cat) => {
            const groups = groupedByCategory.get(cat) || [];
            if (groups.length === 0) return null;

            return (
              <div key={cat} className="rc-panel">
                <div
                  className="rc-row"
                  style={{
                    justifyContent: "space-between",
                    alignItems: "baseline",
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: 18, letterSpacing: 0.2 }}>
                    {cat}
                  </h2>
                  <div className="rc-subtle">{groups.length}</div>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {groups.map((g) => {
                    const count = g.items.length;
                    const isExpanded = !!expandedGroups[g.key];
                    const allChecked = g.items.every((i) => i.checked);
                    const anyChecked = g.items.some((i) => i.checked);

                    return (
                      <div key={g.key} className="rc-card">
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={(el) => {
                              if (el) el.indeterminate = !allChecked && anyChecked;
                            }}
                            onChange={(e) => {
                              const nextChecked = e.target.checked;
                              const ids = g.items.map((i) => i.id);
                              setStatus("Updating…");
                              patchMany(ids, { checked: nextChecked }).finally(() =>
                                setStatus("")
                              );
                            }}
                            style={{ margin: 0, width: 18, height: 18 }}
                            aria-label={`Toggle ${g.display}`}
                          />

                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 850,
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                textDecoration: allChecked ? "line-through" : "none",
                                opacity: allChecked ? 0.6 : 1,
                              }}
                            >
                              <span style={{ fontSize: 18 }}>{g.display}</span>
                              {count > 1 ? <span className="rc-badge">{count}</span> : null}

                              <button
                                onClick={(ev) => {
                                  ev.preventDefault();
                                  setExpandedGroups((prev) => ({
                                    ...prev,
                                    [g.key]: !prev[g.key],
                                  }));
                                }}
                                className="rc-btn"
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 10,
                                  fontSize: 12,
                                }}
                                title="Show details"
                              >
                                {isExpanded ? "Hide" : "Details"}
                              </button>

                              <button
                                onClick={(ev) => {
                                  ev.preventDefault();
                                  const ids = g.items.map((i) => i.id);
                                  setStatus("Dismissing…");
                                  patchMany(ids, { dismissed: true }).finally(() =>
                                    setStatus("")
                                  );
                                }}
                                className="rc-btn"
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 10,
                                  fontSize: 12,
                                }}
                                title="Dismiss all merged instances"
                              >
                                Dismiss
                              </button>
                            </div>

                            {isExpanded ? (
                              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                                {g.items.map((it) => {
                                  const recipeLabel = recipeLabelForItem(it);

                                  return (
                                    <div
                                      key={it.id}
                                      className="rc-card"
                                      style={{ background: "var(--card-2)" }}
                                    >
                                      <div
                                        className="rc-row"
                                        style={{
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          gap: 12,
                                        }}
                                      >
                                        <div style={{ fontSize: 13, opacity: 0.9 }}>
                                          {it.source_recipe_id ? (
                                            <Link
                                              href={`/recipes/${it.source_recipe_id}`}
                                              style={{ textDecoration: "underline" }}
                                            >
                                              {recipeLabel || "Recipe"}
                                            </Link>
                                          ) : recipeLabel ? (
                                            recipeLabel
                                          ) : (
                                            <span style={{ opacity: 0.7 }}>
                                              {it.source_type}
                                            </span>
                                          )}
                                        </div>

                                        <button
                                          onClick={(ev) => {
                                            ev.preventDefault();
                                            patchItem(it.id, { dismissed: true });
                                          }}
                                          className="rc-btn"
                                          style={{
                                            padding: "8px 10px",
                                            borderRadius: 10,
                                            fontSize: 12,
                                          }}
                                          title="Dismiss this instance"
                                        >
                                          Dismiss
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {totalCount === 0 && !everythingHidden ? (
            <div className="rc-panel" style={{ opacity: 0.85 }}>
              No items yet. Sync from Meal Planning or add manually.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
