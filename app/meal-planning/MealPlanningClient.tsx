// app/meal-planning/MealPlanningClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type RecipeRow = {
  id: string;
  title: string;
  tags?: string[] | string | null;
  favorite?: boolean | null;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
};

type DayKey =
  | "Mon"
  | "Tue"
  | "Wed"
  | "Thu"
  | "Fri"
  | "Sat"
  | "Sun";

const DAYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STORAGE_KEY = "recipechaos_meal_plan_v1";

function normalizeTags(tags: RecipeRow["tags"]): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof tags === "string") {
    // allow comma or newline separated
    return tags
      .split(/[,|\n]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function MealPlanningClient({ recipes }: { recipes: RecipeRow[] }) {
  const [mode, setMode] = useState<"manual" | "smart">("manual");
  const [plan, setPlan] = useState<Record<DayKey, string | "">>(() => {
    const empty: Record<DayKey, string | ""> = {
      Mon: "",
      Tue: "",
      Wed: "",
      Thu: "",
      Fri: "",
      Sat: "",
      Sun: "",
    };
    return empty;
  });

  const recipeById = useMemo(() => {
    const m = new Map<string, RecipeRow>();
    for (const r of recipes) m.set(r.id, r);
    return m;
  }, [recipes]);

  const recipeOptions = useMemo(() => {
    return recipes.map((r) => ({
      id: r.id,
      title: r.title,
      tags: normalizeTags(r.tags),
      favorite: !!r.favorite,
      minutes: (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0),
    }));
  }, [recipes]);

  // Load saved plan
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<DayKey, string>>;
      if (!parsed) return;

      setPlan((prev) => {
        const next = { ...prev };
        for (const d of DAYS) {
          const v = parsed[d];
          if (typeof v === "string") next[d] = v;
        }
        return next;
      });
    } catch {
      // ignore
    }
  }, []);

  // Save plan
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    } catch {
      // ignore
    }
  }, [plan]);

  function setDay(day: DayKey, recipeId: string | "") {
    setPlan((p) => ({ ...p, [day]: recipeId }));
  }

  function clearPlan() {
    const empty: Record<DayKey, string | ""> = {
      Mon: "",
      Tue: "",
      Wed: "",
      Thu: "",
      Fri: "",
      Sat: "",
      Sun: "",
    };
    setPlan(empty);
  }

  function smartFill() {
    // “Smart” v1: prefer favorites first, then fill remaining with random recipes.
    const favs = recipeOptions.filter((r) => r.favorite);
    const nonFavs = recipeOptions.filter((r) => !r.favorite);

    const pool = [...shuffle(favs), ...shuffle(nonFavs)];
    const picked = pool.slice(0, 7);

    const next: Record<DayKey, string | ""> = {
      Mon: picked[0]?.id ?? "",
      Tue: picked[1]?.id ?? "",
      Wed: picked[2]?.id ?? "",
      Thu: picked[3]?.id ?? "",
      Fri: picked[4]?.id ?? "",
      Sat: picked[5]?.id ?? "",
      Sun: picked[6]?.id ?? "",
    };
    setPlan(next);
  }

  return (
    <div
      style={{
        padding: 18,
        borderRadius: 16,
        background: "rgba(0,0,0,0.04)",
        border: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => setMode("manual")}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.15)",
            cursor: "pointer",
            background: mode === "manual" ? "rgba(120,60,200,0.15)" : "white",
            fontWeight: 700,
          }}
        >
          Manual
        </button>

        <button
          onClick={() => setMode("smart")}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.15)",
            cursor: "pointer",
            background: mode === "smart" ? "rgba(120,60,200,0.15)" : "white",
            fontWeight: 700,
          }}
        >
          Smart
        </button>

        <div style={{ flex: 1 }} />

        <button
          onClick={clearPlan}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.15)",
            cursor: "pointer",
            background: "white",
          }}
        >
          Clear week
        </button>

        <button
          onClick={smartFill}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.15)",
            cursor: "pointer",
            background: "white",
          }}
        >
          Auto-fill week
        </button>
      </div>

      <div style={{ marginTop: 14, opacity: 0.8 }}>
        {mode === "manual"
          ? "Pick a recipe for each day. Saved automatically (local)."
          : "Smart mode (v1) fills your week using favorites first, then random recipes."}
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        {DAYS.map((day) => {
          const rid = plan[day];
          const recipe = rid ? recipeById.get(rid) : null;

          return (
            <div
              key={day}
              style={{
                padding: 14,
                borderRadius: 14,
                background: "white",
                border: "1px solid rgba(0,0,0,0.10)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontWeight: 900 }}>{day}</div>
                {recipe ? (
                  <Link
                    href={`/recipes/${recipe.id}`}
                    style={{ textDecoration: "underline", fontSize: 13 }}
                  >
                    View
                  </Link>
                ) : (
                  <span style={{ fontSize: 13, opacity: 0.6 }}>—</span>
                )}
              </div>

              <div style={{ marginTop: 10 }}>
                <select
                  value={rid}
                  onChange={(e) => setDay(day, e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.15)",
                    background: "white",
                  }}
                >
                  <option value="">(none)</option>
                  {recipeOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                      {r.favorite ? " ★" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {recipe ? (
                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
                  <div style={{ fontWeight: 700 }}>{recipe.title}</div>
                  {normalizeTags(recipe.tags).length ? (
                    <div style={{ marginTop: 4, opacity: 0.7 }}>
                      Tags: {normalizeTags(recipe.tags).join(", ")}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, fontSize: 13, opacity: 0.7 }}>
        Next step (when you’re ready): generate a shopping list from the selected week.
      </div>
    </div>
  );
}
