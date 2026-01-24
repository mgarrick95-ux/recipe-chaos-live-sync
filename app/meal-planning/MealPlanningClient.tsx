// app/meal-planning/page.tsx
"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import RcPageShell from "@/components/rc/RcPageShell";
import { useUIPrefs } from "../../components/UIPrefsProvider";
import { t } from "@/lib/copy";

type Recipe = {
  id: string;
  title: string;
  favorite?: boolean | null;
};

type Slot = {
  slotId: string;
  recipeId: string | null;
};

type PlanResponse = {
  ok: boolean;
  plan?: {
    id: string | null;
    name: string;
    start_date: string;
    end_date: string;
    meal_count?: number;
    selected_recipe_ids: any;
    created_at?: string;
    updated_at?: string;
  };
  error?: string;
  note?: string;
};

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clampMealCount(n: any) {
  const num = typeof n === "number" ? n : typeof n === "string" ? Number(n) : NaN;
  if (!Number.isFinite(num)) return 7;
  const rounded = Math.floor(num);
  return Math.max(0, Math.min(60, rounded));
}

function makeEmptySlots(count: number): Slot[] {
  const n = clampMealCount(count);
  return Array.from({ length: n }).map(() => ({ slotId: uid(), recipeId: null }));
}

export default function MealPlanningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { prefs, brainCapacity } = useUIPrefs();

  const prefsForCopy = prefs as any;

  const startParam = searchParams.get("start");
  const initialStart = useMemo(() => {
    if (startParam) {
      const parsed = new Date(`${startParam}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) return startOfWeekMonday(parsed);
    }
    return startOfWeekMonday(new Date());
  }, [startParam]);

  const [weekStart, setWeekStart] = useState<Date>(initialStart);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekStartStr = useMemo(() => toISODate(weekStart), [weekStart]);
  const weekEndStr = useMemo(() => toISODate(weekEnd), [weekEnd]);

  useEffect(() => {
    setWeekStart(initialStart);
  }, [initialStart]);

  function goToWeek(d: Date) {
    const monday = startOfWeekMonday(d);
    router.push(`/meal-planning?start=${toISODate(monday)}`);
  }

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [recipesError, setRecipesError] = useState<string | null>(null);

  const [mealCount, setMealCount] = useState<number>(7);
  const [slots, setSlots] = useState<Slot[]>(makeEmptySlots(7));
  const [status, setStatus] = useState<string>("");

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const selectedIdsForSave = useMemo(
    () => slots.map((s) => s.recipeId).filter(Boolean) as string[],
    [slots]
  );

  const pageTitle = t("WEEKLY_TITLE", prefsForCopy, brainCapacity);

  useEffect(() => {
    let alive = true;

    async function loadRecipes() {
      try {
        setLoadingRecipes(true);
        setRecipesError(null);

        const res = await fetch("/api/recipes", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error((json as any)?.error || "Failed to load recipes");

        const list: Recipe[] = Array.isArray(json) ? json : json?.recipes ?? [];
        if (alive) setRecipes(list);
      } catch (e: any) {
        if (alive) setRecipesError(e?.message || "Failed to load recipes");
      } finally {
        if (alive) setLoadingRecipes(false);
      }
    }

    loadRecipes();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <RcPageShell
      header={
        <div>
          <h1 className="text-4xl font-extrabold">{pageTitle}</h1>
          <div className="text-sm opacity-70">
            Week: {weekStartStr} → {weekEndStr}
            {status ? ` • ${status}` : ""}
          </div>
        </div>
      }
    >
      <div className="mt-6">
        {loadingRecipes ? (
          <div>Loading…</div>
        ) : recipesError ? (
          <div className="text-red-400">{recipesError}</div>
        ) : (
          <div className="grid gap-4">
            {slots.map((slot, idx) => {
              const r = slot.recipeId ? recipeById.get(slot.recipeId) : null;

              return (
                <div key={slot.slotId} className="rounded-2xl bg-white/5 p-4">
                  <div className="flex justify-between items-center">
                    <div className="font-bold">Meal {idx + 1}</div>
                    {r ? (
                      <Link href={`/recipes/${r.id}`} className="text-sm underline">
                        View
                      </Link>
                    ) : null}
                  </div>

                  <select
                    value={slot.recipeId ?? ""}
                    onChange={(e) => {
                      const value = e.target.value || null;
                      setSlots((prev) =>
                        prev.map((s) =>
                          s.slotId === slot.slotId ? { ...s, recipeId: value } : s
                        )
                      );
                    }}
                    className="mt-2 w-full rounded-xl bg-black/20 p-2"
                  >
                    <option value="">— none —</option>
                    {recipes.map((rec) => (
                      <option key={rec.id} value={rec.id}>
                        {rec.favorite ? "★ " : ""}
                        {rec.title}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </RcPageShell>
  );
}
