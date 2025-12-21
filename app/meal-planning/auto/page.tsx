// app/meal-planning/auto/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Recipe = {
  id: string;
  title: string;
  favorite?: boolean | null;
};

type Slot = {
  slotId: string;        // stable key
  recipeId: string | null;
  locked: boolean;
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
  // stable enough for client-only slot IDs
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

export default function SmartMealPlanningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

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
  const [draftDate, setDraftDate] = useState<string>(toISODate(weekStart));

  useEffect(() => {
    setWeekStart(initialStart);
    setDraftDate(toISODate(initialStart));
  }, [initialStart]);

  const weekStartStr = useMemo(() => toISODate(weekStart), [weekStart]);
  const weekEndStr = useMemo(() => toISODate(weekEnd), [weekEnd]);

  function goToWeek(d: Date) {
    const monday = startOfWeekMonday(d);
    router.push(`/meal-planning/auto?start=${toISODate(monday)}`);
  }

  function applyDraftDate() {
    const parsed = new Date(`${draftDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      setDraftDate(toISODate(weekStart));
      return;
    }
    goToWeek(parsed);
  }

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  // 7 slots = 7 dinners, tweak later if you want
  const [slots, setSlots] = useState<Slot[]>(() =>
    Array.from({ length: 7 }).map(() => ({
      slotId: uid(),
      recipeId: null,
      locked: false,
    }))
  );

  // Load recipes once
  useEffect(() => {
    let alive = true;

    async function loadRecipes() {
      try {
        setLoadingRecipes(true);
        setError(null);

        const res = await fetch("/api/recipes", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Failed to load recipes");

        const list: Recipe[] = Array.isArray(json) ? json : json?.recipes ?? [];
        if (alive) setRecipes(list);
      } catch (e: any) {
        if (alive) setError(e?.message || "Failed to load recipes");
      } finally {
        if (alive) setLoadingRecipes(false);
      }
    }

    loadRecipes();
    return () => {
      alive = false;
    };
  }, []);

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  // Optional: load saved week memory (so smart page reflects the current plan)
  useEffect(() => {
    let alive = true;

    async function loadWeek() {
      try {
        setStatus("Loading week…");
        const res = await fetch(`/api/meal-plans/current?start=${weekStartStr}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Failed to load week memory");

        const ids: string[] = json?.plan?.selected_recipe_ids ?? [];

        // Apply into slots WITHOUT breaking locks:
        // - if locked slots already have a recipe, keep them
        // - fill remaining slots from saved plan in order
        if (!alive) return;

        setSlots((prev) => {
          const next = prev.map((s) => ({ ...s }));
          const used = new Set<string>();

          // keep locked recipeIds
          for (const s of next) {
            if (s.locked && s.recipeId) used.add(s.recipeId);
          }

          // place saved ids into unlocked slots
          let idx = 0;
          for (const s of next) {
            if (s.locked) continue;
            // advance to next unused saved id
            while (idx < ids.length && used.has(ids[idx])) idx++;
            s.recipeId = idx < ids.length ? ids[idx] : s.recipeId;
            if (s.recipeId) used.add(s.recipeId);
            idx++;
          }

          setStatus("");
          return next;
        });
      } catch {
        if (alive) setStatus("Week error");
      }
    }

    loadWeek();
    return () => {
      alive = false;
    };
  }, [weekStartStr]);

  // --- SMART PICK LOGIC (favorites-first + random) ---
  // You can improve scoring later (storage match, tags, etc.)
  const favoriteIds = useMemo(() => {
    return new Set(recipes.filter((r) => r.favorite).map((r) => r.id));
  }, [recipes]);

  function buildCandidatePool(exclude: Set<string>) {
    const favs = recipes.filter((r) => favoriteIds.has(r.id) && !exclude.has(r.id));
    const others = recipes.filter((r) => !favoriteIds.has(r.id) && !exclude.has(r.id));

    // favorites first, both shuffled
    return [...shuffle(favs), ...shuffle(others)];
  }

  function generateIntoUnlocked() {
    setSlots((prev) => {
      const next = prev.map((s) => ({ ...s }));
      const used = new Set<string>();

      // keep current recipes for locked slots, and also keep already-assigned recipes
      for (const s of next) {
        if (s.recipeId) used.add(s.recipeId);
      }

      // BUT: when regenerating, we want to free up unlocked slots (their recipeIds can change)
      // So remove unlocked slot recipeIds from used set, because they’re allowed to be replaced.
      for (const s of next) {
        if (!s.locked && s.recipeId) used.delete(s.recipeId);
      }

      const pool = buildCandidatePool(used);
      let poolIdx = 0;

      for (const s of next) {
        if (s.locked) continue; // do not touch locked slots
        const pick = pool[poolIdx++];
        s.recipeId = pick ? pick.id : null;
      }

      return next;
    });
  }

  // Initial generation if empty
  useEffect(() => {
    if (loadingRecipes || error) return;
    const hasAny = slots.some((s) => s.recipeId);
    if (!hasAny && recipes.length) {
      generateIntoUnlocked();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingRecipes, error, recipes.length]);

  function toggleLock(slotId: string) {
    setSlots((prev) =>
      prev.map((s) => (s.slotId === slotId ? { ...s, locked: !s.locked } : s))
    );
  }

  function clearSlot(slotId: string) {
    setSlots((prev) =>
      prev.map((s) =>
        s.slotId === slotId ? { ...s, recipeId: null, locked: false } : s
      )
    );
  }

  async function saveSelection() {
    try {
      setStatus("Saving…");
      const selectedIds = slots.map((s) => s.recipeId).filter(Boolean) as string[];

      const res = await fetch("/api/meal-plans/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Selected Week",
          start_date: weekStartStr,
          selected_recipe_ids: selectedIds,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Save failed");

      setStatus("Saved ✅");
      setTimeout(() => setStatus(""), 1500);
    } catch {
      setStatus("Save error");
    }
  }

  async function syncShoppingList() {
    try {
      setStatus("Syncing shopping list…");
      const selectedIds = slots.map((s) => s.recipeId).filter(Boolean) as string[];

      const res = await fetch("/api/shopping-list/sync-derived", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_ids: selectedIds,
          sourceUsed: "meal_plan_smart",
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Sync failed");

      setStatus(`Synced ✅ (${json?.derived_count ?? 0})`);
      setTimeout(() => setStatus(""), 2000);
    } catch {
      setStatus("Sync error");
    }
  }

  const selectedCount = useMemo(() => slots.filter((s) => s.recipeId).length, [slots]);

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-6xl font-extrabold tracking-tight">Smart Meal Planning</h1>
            <p className="mt-3 text-white/70">
              Lock what you like, then regenerate the rest without changing locked picks.
            </p>

            <div className="mt-4 text-white/60">
              <span className="font-semibold text-white/80">Plan:</span>{" "}
              Selected Week{" "}
              <span className="text-white/50">
                ({weekStartStr} → {weekEndStr})
              </span>
              {status ? <span className="ml-3 text-white/40">• {status}</span> : null}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2"
                onClick={() => goToWeek(new Date())}
              >
                This week
              </button>
              <button
                className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2"
                onClick={() => goToWeek(addDays(new Date(), 7))}
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

          {/* Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-white/60">{selectedCount}/7</div>
            <button
              onClick={generateIntoUnlocked}
              className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2"
              disabled={loadingRecipes || !!error || recipes.length === 0}
            >
              Regenerate unlocked
            </button>
            <button
              onClick={saveSelection}
              className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2"
            >
              Save selection
            </button>
            <button
              onClick={syncShoppingList}
              className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2"
            >
              Sync Shopping List
            </button>
            <Link
              href="/meal-planning"
              className="rounded-xl bg-white text-black hover:bg-white/90 px-4 py-2"
            >
              Manual
            </Link>
          </div>
        </div>

        {/* Body */}
        <div className="mt-10 rounded-2xl bg-white/5 ring-1 ring-white/10 p-6">
          {loadingRecipes ? (
            <div className="text-white/60">Loading recipes…</div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-5 py-4 text-red-100">
              {error}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {slots.map((slot, idx) => {
                const r = slot.recipeId ? recipeById.get(slot.recipeId) : null;

                return (
                  <div
                    key={slot.slotId} // IMPORTANT: stable key so locks don’t “move”
                    className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-white/50 text-sm">Day {idx + 1}</div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleLock(slot.slotId)}
                          className={`rounded-lg px-3 py-1 text-sm ${
                            slot.locked
                              ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/20"
                              : "bg-white/10 hover:bg-white/15 text-white/80"
                          }`}
                          disabled={!slot.recipeId}
                          title={slot.locked ? "Unlock" : "Lock"}
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
                          <div className="mt-2 flex items-center justify-between">
                            <Link
                              href={`/recipes/${r.id}`}
                              className="text-white/70 hover:text-white underline underline-offset-4 text-sm"
                            >
                              View recipe
                            </Link>

                            <span className="text-white/40 text-xs">{r.id}</span>
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
            Tip: Lock the ones you like, then hit <span className="text-white/70">Regenerate unlocked</span>.
            Locked picks will stay put.
          </div>
        </div>
      </div>
    </div>
  );
}
