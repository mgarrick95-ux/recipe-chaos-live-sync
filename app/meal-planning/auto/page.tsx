// app/meal-planning/auto/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Recipe = {
  id: string;
  title: string;
  favorite?: boolean | null;
};

type Slot = {
  slotId: string;
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
  const weekStartStr = useMemo(() => toISODate(weekStart), [weekStart]);
  const weekEndStr = useMemo(() => toISODate(weekEnd), [weekEnd]);

  const [draftDate, setDraftDate] = useState<string>(toISODate(initialStart));

  useEffect(() => {
    setWeekStart(initialStart);
    setDraftDate(toISODate(initialStart));
  }, [initialStart]);

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

  const [slots, setSlots] = useState<Slot[]>(() =>
    Array.from({ length: 7 }).map(() => ({
      slotId: uid(),
      recipeId: null,
      locked: false,
    }))
  );

  const lastLoadedWeek = useRef<string>("");

  // Load recipes
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
  const favoriteIds = useMemo(() => new Set(recipes.filter((r) => r.favorite).map((r) => r.id)), [recipes]);

  function buildCandidatePool(exclude: Set<string>) {
    const favs = recipes.filter((r) => favoriteIds.has(r.id) && !exclude.has(r.id));
    const others = recipes.filter((r) => !favoriteIds.has(r.id) && !exclude.has(r.id));
    return [...shuffle(favs), ...shuffle(others)];
  }

  // Load week plan from Supabase (same as Manual)
  useEffect(() => {
    let alive = true;

    async function loadWeek() {
      try {
        setStatus("Loading week…");
        const res = await fetch(`/api/meal-plans/current?start=${weekStartStr}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Failed to load week");

        const ids: (string | null)[] = Array.isArray(json?.plan?.selected_recipe_ids)
          ? (json.plan.selected_recipe_ids as (string | null)[])
          : [];

        if (!alive) return;

        if (lastLoadedWeek.current !== weekStartStr) {
          lastLoadedWeek.current = weekStartStr;
          setSlots((prev) =>
            prev.map((s, i) => ({
              ...s,
              recipeId: (ids[i] as any) ?? null,
              locked: false,
            }))
          );
        }

        setStatus("");
      } catch (e: any) {
        if (alive) setStatus(e?.message || "Week load error");
      }
    }

    loadWeek();
    return () => {
      alive = false;
    };
  }, [weekStartStr]);

  function toggleLock(slotId: string) {
    setSlots((prev) => prev.map((s) => (s.slotId === slotId ? { ...s, locked: !s.locked } : s)));
  }

  function clearUnlocked() {
    setSlots((prev) => prev.map((s) => (s.locked ? s : { ...s, recipeId: null })));
    setStatus("Cleared unlocked slots.");
    window.setTimeout(() => setStatus(""), 1400);
  }

  function regenerateUnlocked() {
    if (!recipes.length) {
      setStatus("No recipes available yet.");
      window.setTimeout(() => setStatus(""), 1400);
      return;
    }

    setSlots((prev) => {
      const lockedIds = new Set(prev.filter((s) => s.locked && s.recipeId).map((s) => s.recipeId!));
      const pool = buildCandidatePool(lockedIds);

      let poolIdx = 0;
      const used = new Set<string>(lockedIds);

      return prev.map((s) => {
        if (s.locked) return s;

        while (poolIdx < pool.length && used.has(pool[poolIdx].id)) poolIdx++;
        const picked = poolIdx < pool.length ? pool[poolIdx++].id : null;
        if (picked) used.add(picked);

        return { ...s, recipeId: picked };
      });
    });

    setStatus("Regenerated unlocked picks.");
    window.setTimeout(() => setStatus(""), 1400);
  }

  function pickRecipe(slotId: string, recipeId: string | null) {
    setSlots((prev) => prev.map((s) => (s.slotId === slotId ? { ...s, recipeId } : s)));
  }

  async function saveLockedToManual() {
    try {
      const lockedPicked = slots
        .filter((s) => s.locked && s.recipeId)
        .map((s) => s.recipeId!)
        .filter((id, idx, arr) => arr.indexOf(id) === idx);

      if (lockedPicked.length === 0) {
        setStatus("Lock at least one picked recipe first.");
        window.setTimeout(() => setStatus(""), 1600);
        return;
      }

      setStatus("Saving locked picks…");

      const getRes = await fetch(`/api/meal-plans/current?start=${weekStartStr}`, { cache: "no-store" });
      const getJson = await getRes.json().catch(() => null);
      if (!getRes.ok) throw new Error(getJson?.error || "Failed to load current plan");

      const currentIdsRaw: (string | null)[] = Array.isArray(getJson?.plan?.selected_recipe_ids)
        ? (getJson.plan.selected_recipe_ids as (string | null)[])
        : [];

      const base: (string | null)[] = Array.from({ length: 7 }).map((_, i) => (currentIdsRaw[i] as any) ?? null);

      const existing = new Set(base.filter(Boolean) as string[]);
      const lockedToInsert = lockedPicked.filter((id) => !existing.has(id));

      if (lockedToInsert.length === 0) {
        setStatus("All locked picks are already in Manual (no duplicates added).");
        window.setTimeout(() => setStatus(""), 2000);
        return;
      }

      const merged = [...base];
      let writeIdx = 0;

      for (let i = 0; i < merged.length; i++) {
        if (merged[i] !== null) continue;
        if (writeIdx >= lockedToInsert.length) break;
        merged[i] = lockedToInsert[writeIdx++];
      }

      if (writeIdx < lockedToInsert.length) {
        for (let i = 0; i < merged.length && writeIdx < lockedToInsert.length; i++) {
          merged[i] = lockedToInsert[writeIdx++];
        }
      }

      const postRes = await fetch("/api/meal-plans/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Weekly List",
          start_date: weekStartStr,
          selected_recipe_ids: merged,
        }),
      });

      const postJson = await postRes.json().catch(() => null);
      if (!postRes.ok) throw new Error(postJson?.error || "Save failed");

      setStatus("Saved locked picks ✅ (no duplicates added)");
      window.setTimeout(() => setStatus(""), 1600);
    } catch (e: any) {
      setStatus(e?.message || "Save error");
      window.setTimeout(() => setStatus(""), 2000);
    }
  }

  const lockedCount = useMemo(() => slots.filter((s) => s.locked).length, [slots]);

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Smart Picks</h1>
          <div className="pageSubhead">Lock what you like. Regenerate the rest. No day pressure.</div>
          <div className="pageMeta">
            Week: <b>{weekStartStr}</b> → <b>{weekEndStr}</b>
            {status ? <span> • {status}</span> : null}
          </div>
        </div>

        <div className="actions">
          <Link className="btn btnQuiet" href={`/meal-planning?start=${weekStartStr}`}>
            ← Back to Weekly List
          </Link>
        </div>
      </div>

      <div className="actionsRow">
        <button type="button" className="btn btnQuiet" onClick={() => goToWeek(addDays(weekStart, -7))}>
          ← Prev
        </button>
        <button type="button" className="btn btnQuiet" onClick={() => goToWeek(addDays(weekStart, 7))}>
          Next →
        </button>

        <div style={{ flex: 1 }} />

        <input className="input" style={{ width: 180 }} type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
        <button type="button" className="btn btnQuiet" onClick={applyDraftDate}>
          Go
        </button>
      </div>

      {error ? (
        <div className="card" style={{ marginTop: 14, borderColor: "rgba(255,77,79,0.35)" }}>
          <b>Error:</b> {error}
        </div>
      ) : null}

      <div className="actionsRow" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn btnPrimary"
          onClick={regenerateUnlocked}
          disabled={loadingRecipes || recipes.length === 0}
        >
          Regenerate Unlocked
        </button>

        <button type="button" className="btn btnQuiet" onClick={clearUnlocked}>
          Clear Unlocked
        </button>

        <button type="button" className="btn btnQuiet" onClick={saveLockedToManual}>
          Save Locked → Weekly List
        </button>

        <div style={{ flex: 1 }} />

        <div className="muted">
          Locked: <b>{lockedCount}</b> / 7
        </div>
      </div>

      <div className="grid">
        {loadingRecipes ? (
          <div className="card">Loading…</div>
        ) : recipes.length === 0 ? (
          <div className="card">No recipes yet. Add recipes first, then come back.</div>
        ) : (
          slots.map((slot, idx) => {
            const current = slot.recipeId ? recipeById.get(slot.recipeId) : undefined;

            return (
              <div key={slot.slotId} className="card cardHover">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.2 }}>
                    Item {idx + 1} {slot.locked ? <span className="small" style={{ marginLeft: 8 }}>• Locked</span> : null}
                  </div>

                  <button type="button" className={`btn ${slot.locked ? "btnPrimary" : "btnQuiet"}`} onClick={() => toggleLock(slot.slotId)}>
                    {slot.locked ? "Locked" : "Lock"}
                  </button>
                </div>

                <div className="small" style={{ marginTop: 10 }}>
                  {current?.title ? (
                    <>
                      Current: <b>{current.title}</b> {current.favorite ? "★" : ""}
                    </>
                  ) : (
                    "Not picked yet."
                  )}
                </div>

                <select
                  className="select"
                  value={slot.recipeId ?? ""}
                  onChange={(e) => pickRecipe(slot.slotId, e.target.value || null)}
                  style={{ marginTop: 12 }}
                >
                  <option value="">(Select a recipe…)</option>
                  {recipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.favorite ? "★ " : ""}
                      {r.title}
                    </option>
                  ))}
                </select>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
