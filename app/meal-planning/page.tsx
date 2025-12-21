// app/meal-planning/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Recipe = {
  id: string;
  title: string;
  favorite?: boolean | null;
};

type MealPlan = {
  id: string;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  selected_recipe_ids: string[]; // jsonb
};

type Slot = {
  slotId: string;
  recipeId: string | null;
  locked: boolean;
};

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun
  const diff = (day + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - diff);
  return d;
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MealPlanningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const modeParam = (searchParams.get("mode") || "manual").toLowerCase();
  const mode: "manual" | "smart" = modeParam === "smart" ? "smart" : "manual";

  const startParam = searchParams.get("start");
  const initialWeekStart = useMemo(() => {
    if (startParam) {
      const parsed = new Date(`${startParam}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) return startOfWeekMonday(parsed);
    }
    return startOfWeekMonday(new Date());
  }, [startParam]);

  const [weekStart, setWeekStart] = useState<Date>(initialWeekStart);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const weekStartStr = useMemo(() => toISODate(weekStart), [weekStart]);
  const weekEndStr = useMemo(() => toISODate(weekEnd), [weekEnd]);

  const prevWeekStart = useMemo(() => addDays(weekStart, -7), [weekStart]);
  const prevWeekEnd = useMemo(() => addDays(prevWeekStart, 6), [prevWeekStart]);
  const prevWeekStartStr = useMemo(() => toISODate(prevWeekStart), [prevWeekStart]);
  const prevWeekEndStr = useMemo(() => toISODate(prevWeekEnd), [prevWeekEnd]);

  const [draftDate, setDraftDate] = useState<string>(toISODate(weekStart));

  useEffect(() => {
    setWeekStart(initialWeekStart);
    setDraftDate(toISODate(initialWeekStart));
  }, [initialWeekStart]);

  function pushWeek(d: Date) {
    const monday = startOfWeekMonday(d);
    router.push(`/meal-planning?mode=${mode}&start=${toISODate(monday)}`);
  }

  function applyDraftDate() {
    const parsed = new Date(`${draftDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      setDraftDate(toISODate(weekStart));
      return;
    }
    pushWeek(parsed);
  }

  function setMode(next: "manual" | "smart") {
    router.push(`/meal-planning?mode=${next}&start=${weekStartStr}`);
  }

  // ---- Load recipes ----
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [recipesError, setRecipesError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoadingRecipes(true);
        setRecipesError(null);

        const res = await fetch("/api/recipes", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Failed to load recipes");

        const list: Recipe[] = Array.isArray(json) ? json : json?.recipes ?? [];
        if (alive) setRecipes(list);
      } catch (e: any) {
        if (alive) setRecipesError(e?.message || "Failed to load recipes");
      } finally {
        if (alive) setLoadingRecipes(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const favoriteIds = useMemo(
    () => new Set(recipes.filter((r) => r.favorite).map((r) => r.id)),
    [recipes]
  );

  // ---- Shared week memory ----
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [prevPlan, setPrevPlan] = useState<MealPlan | null>(null);
  const [planStatus, setPlanStatus] = useState<string>("");

  async function fetchPlan(start: string) {
    const res = await fetch(`/api/meal-plans/current?start=${start}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || "Failed to load week");
    return json?.plan ?? null;
  }

  async function loadPlans() {
    try {
      setPlanStatus("Loading week…");
      const [p, pp] = await Promise.allSettled([fetchPlan(weekStartStr), fetchPlan(prevWeekStartStr)]);

      const current = p.status === "fulfilled" ? p.value : null;
      const previous = pp.status === "fulfilled" ? pp.value : null;

      setPlan(current);
      setPrevPlan(previous);
      setPlanStatus("");
    } catch {
      setPlan(null);
      setPrevPlan(null);
      setPlanStatus("Week error");
    }
  }

  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartStr, prevWeekStartStr]);

  const selectedIds = useMemo(() => {
    const ids = (plan?.selected_recipe_ids ?? []) as any;
    return Array.isArray(ids) ? (ids.filter(Boolean) as string[]) : [];
  }, [plan]);

  const prevSelectedIds = useMemo(() => {
    const ids = (prevPlan?.selected_recipe_ids ?? []) as any;
    return Array.isArray(ids) ? (ids.filter(Boolean) as string[]) : [];
  }, [prevPlan]);

  async function savePlan(nextSelectedIds: string[]) {
    try {
      setPlanStatus("Saving…");
      const res = await fetch("/api/meal-plans/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Selected Week",
          start_date: weekStartStr,
          end_date: weekEndStr,
          selected_recipe_ids: nextSelectedIds,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Save failed");

      await loadPlans();
      setPlanStatus("Saved ✅");
      setTimeout(() => setPlanStatus(""), 1200);
    } catch {
      setPlanStatus("Save error");
    }
  }

  async function reuseLastWeek(overwrite: boolean) {
    if (!prevSelectedIds.length) return;

    if (!overwrite) {
      const merged = Array.from(new Set([...selectedIds, ...prevSelectedIds]));
      await savePlan(merged);
      return;
    }

    await savePlan(prevSelectedIds);
  }

  async function clearThisWeek() {
    await savePlan([]);
  }

  async function syncShoppingListFromPlan() {
    try {
      setPlanStatus("Syncing…");
      const res = await fetch("/api/shopping-list/sync-derived", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_ids: selectedIds,
          sourceUsed: "meal_plan",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Sync failed");

      setPlanStatus(`Synced ✅ (${json?.derived_count ?? 0})`);
      setTimeout(() => setPlanStatus(""), 1500);
    } catch {
      setPlanStatus("Sync error");
    }
  }

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-6xl font-extrabold tracking-tight">Meal Planning</h1>
            <p className="mt-3 text-white/70">
              One plan per week. Manual + Smart are just modes. Both save to the same week memory.
            </p>

            <div className="mt-4 text-white/60">
              <span className="font-semibold text-white/80">Plan:</span>{" "}
              Selected Week{" "}
              <span className="text-white/50">
                ({weekStartStr} → {weekEndStr})
              </span>
              {planStatus ? <span className="ml-3 text-white/40">• {planStatus}</span> : null}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2"
                onClick={() => pushWeek(new Date())}
              >
                This week
              </button>
              <button
                className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2"
                onClick={() => pushWeek(addDays(new Date(), 7))}
              >
                Next week
              </button>

              <div className="flex items-center gap-2 rounded-xl bg-white/5 ring-1 ring-white/10 px-3 py-2">
                <span className="text-white/70 text-sm">Pick a date</span>
                <input
                  type="date"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  onBlur={applyDraftDate}
                  className="bg-transparent text-white/90 px-2 py-1 rounded-md ring-1 ring-white/10"
                />
                <button
                  className="rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1 text-sm"
                  onClick={applyDraftDate}
                >
                  Apply
                </button>
                <span className="text-white/40 text-xs">(auto → Monday)</span>
              </div>
            </div>
          </div>

          {/* Mode + actions */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setMode("manual")}
              className={`rounded-xl px-4 py-2 ${
                mode === "manual" ? "bg-white text-black" : "bg-white/10 hover:bg-white/15"
              }`}
            >
              Manual
            </button>

            <button
              onClick={() => setMode("smart")}
              className={`rounded-xl px-4 py-2 ${
                mode === "smart" ? "bg-white text-black" : "bg-white/10 hover:bg-white/15"
              }`}
            >
              Smart mode
            </button>

            <button
              onClick={syncShoppingListFromPlan}
              className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2"
              disabled={selectedIds.length === 0}
              title={selectedIds.length === 0 ? "Select recipes first" : "Sync Shopping List"}
            >
              Sync Shopping List
            </button>

            <Link href="/shopping-list" className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2">
              Shopping List
            </Link>
          </div>
        </div>

        {/* Week Snapshot */}
        <div className="mt-8 rounded-2xl bg-white/5 ring-1 ring-white/10 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Week Snapshot</h2>
              <p className="mt-2 text-white/60">
                Gentle memory, not pressure. This is here so you don’t have to hold it in your head.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(`/meal-planning?mode=${mode}&start=${prevWeekStartStr}`)}
                className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2"
              >
                View last week
              </button>
              <button
                onClick={clearThisWeek}
                className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2"
              >
                Clear this week
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
              <div className="text-white/50 text-sm">This week</div>
              <div className="mt-2 text-3xl font-extrabold">{selectedIds.length}</div>
              <div className="mt-1 text-white/60 text-sm">recipes selected</div>
            </div>

            <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
              <div className="text-white/50 text-sm">Last week</div>
              <div className="mt-2 text-3xl font-extrabold">{prevSelectedIds.length}</div>
              <div className="mt-1 text-white/60 text-sm">
                recipes selected{" "}
                <span className="text-white/40">
                  ({prevWeekStartStr} → {prevWeekEndStr})
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
              <div className="text-white/50 text-sm">Quick actions</div>

              {prevSelectedIds.length === 0 ? (
                <div className="mt-3 text-white/60 text-sm">No saved plan found for last week. (Totally fine.)</div>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    onClick={() => reuseLastWeek(true)}
                    className="rounded-xl bg-white text-black hover:bg-white/90 px-4 py-2"
                    title="Replaces this week with last week's selections"
                  >
                    Reuse last week (overwrite)
                  </button>

                  <button
                    onClick={() => reuseLastWeek(false)}
                    className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2"
                    title="Adds last week's recipes to this week (no duplicates)"
                  >
                    Add last week (merge)
                  </button>

                  <div className="text-white/40 text-xs mt-1">You can always remove anything after.</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mode content */}
        <div className="mt-10">
          {mode === "manual" ? (
            <ManualMode
              recipes={recipes}
              loading={loadingRecipes}
              error={recipesError}
              favoriteIds={favoriteIds}
              selectedIds={selectedIds}
              recipeById={recipeById}
              onSave={savePlan}
            />
          ) : (
            <SmartMode
              recipes={recipes}
              loading={loadingRecipes}
              error={recipesError}
              favoriteIds={favoriteIds}
              selectedIds={selectedIds}
              recipeById={recipeById}
              onSave={savePlan}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------- MANUAL MODE -------------------

function ManualMode(props: {
  recipes: Recipe[];
  loading: boolean;
  error: string | null;
  favoriteIds: Set<string>;
  selectedIds: string[];
  recipeById: Map<string, Recipe>;
  onSave: (ids: string[]) => Promise<void>;
}) {
  const { recipes, loading, error, favoriteIds, selectedIds, recipeById, onSave } = props;

  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [localSelected, setLocalSelected] = useState<string[]>(selectedIds);

  useEffect(() => {
    setLocalSelected(selectedIds);
  }, [selectedIds]);

  const suggested = useMemo(() => {
    const favs = recipes.filter((r) => favoriteIds.has(r.id));
    const nonFavs = recipes.filter((r) => !favoriteIds.has(r.id));
    const randomNonFavs = shuffle(nonFavs).slice(0, 30);
    const combined = [...favs, ...randomNonFavs];

    const seen = new Set<string>();
    return combined.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  }, [recipes, favoriteIds]);

  const list = useMemo(() => {
    const base = showAll ? recipes : suggested;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) => r.title.toLowerCase().includes(q));
  }, [recipes, suggested, query, showAll]);

  function toggle(id: string) {
    setLocalSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    await onSave(localSelected);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Manual pick</h2>
            <p className="text-white/60 mt-1">Default is Suggested (not all recipes). Toggle All if you want the full list.</p>
          </div>

          <button
            onClick={() => setShowAll((s) => !s)}
            className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2"
          >
            {showAll ? "Suggested only" : "Show all recipes"}
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            className="w-full rounded-xl bg-white/5 ring-1 ring-white/10 px-4 py-3 text-white placeholder:text-white/40"
          />
          <button onClick={save} className="rounded-xl bg-white text-black hover:bg-white/90 px-4 py-3">
            Save
          </button>
        </div>

        {loading ? (
          <div className="mt-6 text-white/60">Loading recipes…</div>
        ) : error ? (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-950/40 px-5 py-4 text-red-100">{error}</div>
        ) : (
          <div className="mt-6 space-y-3">
            {list.map((r) => {
              const checked = localSelected.includes(r.id);
              return (
                <div
                  key={r.id}
                  className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 flex items-center justify-between gap-3"
                >
                  <label className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(r.id)}
                      className="h-5 w-5"
                    />
                    <span className="truncate">
                      {r.favorite ? "⭐ " : ""}
                      {r.title}
                    </span>
                  </label>

                  <Link
                    href={`/recipes/${r.id}`}
                    className="text-white/70 hover:text-white underline underline-offset-4 text-sm shrink-0"
                  >
                    View
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-6">
        <h2 className="text-2xl font-bold">This week</h2>
        <p className="text-white/60 mt-1">This is shared with Smart mode.</p>

        <div className="mt-5 space-y-3">
          {localSelected.length === 0 ? (
            <div className="text-white/60">No recipes selected yet.</div>
          ) : (
            localSelected.map((id) => {
              const r = recipeById.get(id);
              return (
                <div
                  key={id}
                  className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 flex items-center justify-between gap-3"
                >
                  <span className="truncate">{r ? r.title : id}</span>
                  <button
                    onClick={() => setLocalSelected((prev) => prev.filter((x) => x !== id))}
                    className="rounded-xl bg-white/10 hover:bg-white/15 px-3 py-1 text-sm"
                  >
                    Remove
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-5">
          <button onClick={save} className="w-full rounded-xl bg-white text-black hover:bg-white/90 px-4 py-3">
            Save selection
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------- SMART MODE (FIXED UX) -------------------

function SmartMode(props: {
  recipes: Recipe[];
  loading: boolean;
  error: string | null;
  favoriteIds: Set<string>;
  selectedIds: string[];
  recipeById: Map<string, Recipe>;
  onSave: (ids: string[]) => Promise<void>;
}) {
  const { recipes, loading, error, favoriteIds, selectedIds, recipeById, onSave } = props;

  // You can reduce/increase how many meals you want
  const [mealCount, setMealCount] = useState<number>(7);

  // Smart generates only "slots" — it does NOT show the full recipe list.
  const [slots, setSlots] = useState<Slot[]>(() =>
    Array.from({ length: 7 }).map(() => ({ slotId: uid(), recipeId: null, locked: false }))
  );

  // Keep mealCount in sync with saved selection (no surprises)
  useEffect(() => {
    const n = Math.max(1, Math.min(14, selectedIds.length || 7));
    setMealCount(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join("|")]);

  // Ensure slots length matches mealCount while preserving existing/locked picks
  useEffect(() => {
    setSlots((prev) => {
      const next = [...prev];

      if (next.length < mealCount) {
        const add = Array.from({ length: mealCount - next.length }).map(() => ({
          slotId: uid(),
          recipeId: null,
          locked: false,
        }));
        return [...next, ...add];
      }

      if (next.length > mealCount) {
        // If we shrink, keep the first N slots. (Simple + predictable)
        return next.slice(0, mealCount);
      }

      return next;
    });
  }, [mealCount]);

  // Seed slots from saved plan whenever selectedIds changes
  useEffect(() => {
    setSlots((prev) => {
      const next = prev.map((s) => ({ ...s }));
      const lockedIds = new Set<string>();
      for (const s of next) if (s.locked && s.recipeId) lockedIds.add(s.recipeId);

      let idx = 0;
      for (const s of next) {
        if (s.locked) continue;
        while (idx < selectedIds.length && lockedIds.has(selectedIds[idx])) idx++;
        s.recipeId = idx < selectedIds.length ? selectedIds[idx] : s.recipeId;
        idx++;
      }
      return next;
    });
  }, [selectedIds]);

  function buildCandidatePool(exclude: Set<string>) {
    const favs = recipes.filter((r) => favoriteIds.has(r.id) && !exclude.has(r.id));
    const others = recipes.filter((r) => !favoriteIds.has(r.id) && !exclude.has(r.id));
    return [...shuffle(favs), ...shuffle(others)];
  }

  function regenerateUnlocked() {
    setSlots((prev) => {
      const next = prev.map((s) => ({ ...s }));
      const used = new Set<string>();
      for (const s of next) if (s.locked && s.recipeId) used.add(s.recipeId);

      const pool = buildCandidatePool(used);
      let poolIdx = 0;

      for (const s of next) {
        if (s.locked) continue;
        const pick = pool[poolIdx++];
        s.recipeId = pick ? pick.id : null;
      }

      return next;
    });
  }

  function toggleLock(slotId: string) {
    setSlots((prev) => prev.map((s) => (s.slotId === slotId ? { ...s, locked: !s.locked } : s)));
  }

  function clearSlot(slotId: string) {
    setSlots((prev) =>
      prev.map((s) => (s.slotId === slotId ? { ...s, recipeId: null, locked: false } : s))
    );
  }

  async function save() {
    const ids = slots.map((s) => s.recipeId).filter(Boolean) as string[];
    await onSave(ids);
  }

  const filled = useMemo(() => slots.filter((s) => s.recipeId).length, [slots]);

  return (
    <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Smart mode</h2>
          <p className="text-white/60 mt-1">
            Choose how many meals you want. Lock what you like, regenerate the rest, then Save.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="rounded-xl bg-white/5 ring-1 ring-white/10 px-4 py-3 flex items-center gap-3">
              <span className="text-white/70 text-sm">Meals</span>

              <button
                className="rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1"
                onClick={() => setMealCount((n) => Math.max(1, n - 1))}
                disabled={mealCount <= 1}
              >
                −
              </button>

              <div className="min-w-[2rem] text-center font-semibold">{mealCount}</div>

              <button
                className="rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1"
                onClick={() => setMealCount((n) => Math.min(14, n + 1))}
                disabled={mealCount >= 14}
              >
                +
              </button>

              <span className="text-white/40 text-xs">({filled} filled)</span>
            </div>

            <button
              onClick={regenerateUnlocked}
              className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-3"
              disabled={loading || !!error || recipes.length === 0}
            >
              Regenerate unlocked
            </button>

            <button
              onClick={save}
              className="rounded-xl bg-white text-black hover:bg-white/90 px-4 py-3"
            >
              Save
            </button>
          </div>
        </div>

        <div className="text-white/50 text-sm">
          Smart mode does not show all recipes. It only shows your generated picks.
        </div>
      </div>

      {loading ? (
        <div className="mt-6 text-white/60">Loading recipes…</div>
      ) : error ? (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-950/40 px-5 py-4 text-red-100">{error}</div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((slot, idx) => {
            const r = slot.recipeId ? recipeById.get(slot.recipeId) : null;

            return (
              <div key={slot.slotId} className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-white/50 text-sm">Pick {idx + 1}</div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleLock(slot.slotId)}
                      className={`rounded-lg px-3 py-1 text-sm ${
                        slot.locked
                          ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/20"
                          : "bg-white/10 hover:bg-white/15 text-white/80"
                      }`}
                      disabled={!slot.recipeId}
                    >
                      {slot.locked ? "Locked" : "Lock"}
                    </button>

                    <button
                      onClick={() => clearSlot(slot.slotId)}
                      className="rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1 text-sm text-white/80"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  {r ? (
                    <>
                      <div className="font-semibold text-lg">
                        {r.favorite ? "⭐ " : ""}
                        {r.title}
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-3">
                        <Link
                          href={`/recipes/${r.id}`}
                          className="text-white/70 hover:text-white underline underline-offset-4 text-sm"
                        >
                          View recipe
                        </Link>

                        <button
                          onClick={() => {
                            // quick single-slot regenerate (only this slot) without touching locks
                            setSlots((prev) => {
                              const next = prev.map((s) => ({ ...s }));
                              const target = next.find((s) => s.slotId === slot.slotId);
                              if (!target || target.locked) return next;

                              const used = new Set<string>();
                              for (const s of next) {
                                if (s.slotId === slot.slotId) continue;
                                if (s.recipeId) used.add(s.recipeId);
                              }
                              const pool = (() => {
                                const favs = recipes.filter((rr) => favoriteIds.has(rr.id) && !used.has(rr.id));
                                const others = recipes.filter((rr) => !favoriteIds.has(rr.id) && !used.has(rr.id));
                                return [...shuffle(favs), ...shuffle(others)];
                              })();

                              const pick = pool[0];
                              target.recipeId = pick ? pick.id : null;
                              return next;
                            });
                          }}
                          className="rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1 text-sm"
                        >
                          Swap
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-white/60">Empty slot</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 text-white/50 text-sm">
        Tip: Set meals to 4 or 5 if you want breathing room. Lock what feels right. Swap just one pick if needed.
      </div>
    </div>
  );
}
