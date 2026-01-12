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

function pickBySeed(lines: string[], seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) >>> 0;
  return lines[n % lines.length];
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

/** ---------- Sides helpers ---------- */
type SidesState = string[][]; // index-aligned to slots

function sidesStorageKey(weekStartStr: string) {
  return `recipechaos_meal_sides_v1:${weekStartStr}`;
}

function sanitizeSideInput(raw: string) {
  return (raw || "").trim().replace(/\s+/g, " ");
}

function normalizeSideForShopping(raw: string) {
  const s = sanitizeSideInput(raw);
  if (!s) return "";

  const low = s.toLowerCase();
  if (low === "salad" || low.includes("salad")) return "salad kit";

  return s;
}

function uniqKeepOrder(items: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const key = it.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}

/* =========================
   UI classes
========================= */

const btn =
  "rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2.5 text-sm font-semibold ring-1 ring-white/10 transition disabled:opacity-50";
const btnPrimary =
  "rounded-2xl bg-fuchsia-500 hover:bg-fuchsia-400 px-4 py-2.5 text-sm font-semibold disabled:opacity-50 shadow-lg shadow-fuchsia-500/20 transition";
const iconBtn =
  "rounded-xl bg-white/8 hover:bg-white/12 px-3 py-2 text-xs font-extrabold ring-1 ring-white/10 transition disabled:opacity-50";

const subtleLink =
  "text-xs font-semibold text-white/55 hover:text-white/80 underline underline-offset-4";

const pill =
  "rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70";

const compactInput =
  "rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 outline-none focus:ring-2 focus:ring-fuchsia-400/40";

export default function MealPlanningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { prefs, brainCapacity } = useUIPrefs();

  // build typing workaround for t()
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

  // Sides (index-aligned with slots)
  const [sidesByIndex, setSidesByIndex] = useState<SidesState>(() =>
    Array.from({ length: 7 }).map(() => [])
  );
  const [sideDraftByIndex, setSideDraftByIndex] = useState<Record<number, string>>({});
  const [suggestionsByIndex, setSuggestionsByIndex] = useState<Record<number, string[]>>({});

  // Autosave infra
  const savingTimer = useRef<any>(null);
  const lastSavedPayload = useRef<string>("");
  const latestPayloadRef = useRef<string>("");
  const mountedRef = useRef<boolean>(false);

  // hydration latch so we never autosave the initial empty slots before load completes
  const [weekHydrated, setWeekHydrated] = useState<boolean>(false);

  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const selectedIdsForSave = useMemo(
    () => slots.map((s) => s.recipeId).filter(Boolean) as string[],
    [slots]
  );

  const isWeekEmpty = selectedIdsForSave.length === 0;

  const pageTitle = t("WEEKLY_TITLE", prefsForCopy, brainCapacity);
  const emptyCopy = t("WEEKLY_EMPTY", prefsForCopy, brainCapacity);

  const flavorLine = useMemo(() => {
    if (prefs.reduceChatter) return "A weekly list. Nothing is due.";

    if (brainCapacity === "very_little") {
      return pickBySeed(
        [
          "Easy mode: pick one thing or pick nothing. Both count.",
          "We’re doing “minimum viable dinner” today.",
          "This is a list, not a contract.",
          "No schedule. No guilt. Just options.",
        ],
        weekStartStr
      );
    }

    if (brainCapacity === "some") {
      return pickBySeed(
        [
          "Low-power week. Keep it simple.",
          "Small wins only. The rest can be vibes.",
          "A weekly list you can ignore as needed.",
          "You’re allowed to wing this.",
        ],
        weekStartStr
      );
    }

    if (prefs.tone === "spicy" && brainCapacity === "extra") {
      return pickBySeed(
        [
          "Spicy mode: are you sure you can take it?",
          "Pick a few. Lock nothing. Chaos responsibly.",
          "This list is just suggestions wearing a trench coat.",
          "We’re aiming for “fed,” not “impressive.”",
        ],
        weekStartStr
      );
    }

    return pickBySeed(
      [
        "A weekly list. Not tied to days.",
        "Pick what you want. Skip what you don’t.",
        "Nothing here is a rule.",
        "This is a list, not a schedule.",
      ],
      weekStartStr
    );
  }, [prefs.reduceChatter, prefs.tone, brainCapacity, weekStartStr]);

  function setCalmStatus(msg: string, autoClearMs?: number) {
    if (prefs.reduceChatter) {
      setStatus(msg.length > 18 ? t("GENERIC_UPDATED", prefsForCopy, brainCapacity) : msg);
    } else {
      setStatus(msg);
    }
    if (autoClearMs) window.setTimeout(() => setStatus(""), autoClearMs);
  }

  async function saveWeekNow(opts?: { silent?: boolean; keepalive?: boolean; explicitClear?: boolean }) {
    const silent = Boolean(opts?.silent);
    const keepalive = Boolean(opts?.keepalive);
    const explicitClear = Boolean(opts?.explicitClear);

    const payloadStr = latestPayloadRef.current;
    if (!payloadStr) return;
    if (payloadStr === lastSavedPayload.current) return;

    const parsed = JSON.parse(payloadStr) as {
      start_date: string;
      selected_recipe_ids: string[];
      meal_count: number;
    };

    try {
      if (!silent) setCalmStatus("Saving…");

      const res = await fetch(
        "/api/meal-plans/current",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: t("WEEKLY_TITLE", prefsForCopy, brainCapacity),
            start_date: parsed.start_date,
            meal_count: parsed.meal_count,
            selected_recipe_ids: parsed.selected_recipe_ids,
            explicit_clear: explicitClear === true,
          }),
          keepalive,
        } as any
      );

      const json = (await res.json().catch(() => null)) as PlanResponse | null;
      if (!res.ok) throw new Error((json as any)?.error || "Save failed");

      lastSavedPayload.current = payloadStr;

      if (!silent && mountedRef.current) {
        setCalmStatus("Saved.", 900);
      }
    } catch (e: any) {
      if (!silent && mountedRef.current) {
        setStatus(e?.message || "Save error");
      }
    }
  }

  // mounted guard
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load recipes
  useEffect(() => {
    let alive = true;

    async function loadRecipes() {
      try {
        setLoadingRecipes(true);
        setRecipesError(null);

        const res = await fetch("/api/recipes", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error((json as any)?.error || "Failed to load recipes");

        const list: Recipe[] = Array.isArray(json) ? (json as any) : (json as any)?.recipes ?? [];
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

  // Load plan for this week
  useEffect(() => {
    let alive = true;

    async function loadWeek() {
      try {
        if (alive) setWeekHydrated(false);

        setCalmStatus(prefs.reduceChatter ? "Loading…" : "Loading week…");

        const res = await fetch(`/api/meal-plans/current?start=${weekStartStr}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as PlanResponse | null;
        if (!res.ok) throw new Error(json?.error || "Failed to load week");

        const plan = json?.plan;
        const idsRaw: any = plan?.selected_recipe_ids ?? [];
        const ids: string[] = Array.isArray(idsRaw) ? idsRaw.filter((x) => typeof x === "string") : [];

        const mc = clampMealCount(plan?.meal_count ?? 7);
        if (!alive) return;

        setMealCount(mc);

        setSlots(() => {
          const next = makeEmptySlots(mc);
          for (let i = 0; i < next.length; i++) next[i].recipeId = ids[i] ?? null;
          return next;
        });

        // sides: load from localStorage for this week (index-aligned)
        try {
          const rawSides = localStorage.getItem(sidesStorageKey(weekStartStr));
          const parsed = rawSides ? JSON.parse(rawSides) : null;
          const loaded: SidesState = Array.isArray(parsed)
            ? parsed.map((x: any) => (Array.isArray(x) ? x.filter((s) => typeof s === "string") : []))
            : [];
          const nextSides: SidesState = Array.from({ length: mc }).map((_, i) => loaded[i] ?? []);
          setSidesByIndex(nextSides);
        } catch {
          setSidesByIndex(Array.from({ length: mc }).map(() => []));
        }

        setSideDraftByIndex({});
        setSuggestionsByIndex({});

        // Seed save refs to loaded plan
        const loadedPayload = JSON.stringify({
          start_date: weekStartStr,
          meal_count: mc,
          selected_recipe_ids: ids.filter(Boolean),
        });
        latestPayloadRef.current = loadedPayload;
        lastSavedPayload.current = loadedPayload;

        setStatus("");
        setWeekHydrated(true);
      } catch (e: any) {
        if (alive) setStatus(e?.message || "Week load error");
      }
    }

    loadWeek();
    return () => {
      alive = false;
    };
  }, [weekStartStr, prefs.reduceChatter]);

  // Persist sides (local, per week)
  useEffect(() => {
    if (!weekHydrated) return;
    try {
      localStorage.setItem(sidesStorageKey(weekStartStr), JSON.stringify(sidesByIndex));
    } catch {
      // ignore
    }
  }, [sidesByIndex, weekStartStr, weekHydrated]);

  // When mealCount changes via UI, resize slots while preserving existing selections.
  function applyMealCount(nextCount: number) {
    const mc = clampMealCount(nextCount);

    setMealCount(mc);
    setSlots((prev) => {
      const next: Slot[] = makeEmptySlots(mc);
      for (let i = 0; i < Math.min(prev.length, next.length); i++) {
        next[i].recipeId = prev[i]?.recipeId ?? null;
      }
      return next;
    });

    // keep sides aligned by index
    setSidesByIndex((prev) => {
      const next: SidesState = Array.from({ length: mc }).map((_, i) => prev[i] ?? []);
      return next;
    });

    setSideDraftByIndex((prev) => {
      const next: Record<number, string> = {};
      for (const k of Object.keys(prev)) {
        const idx = Number(k);
        if (Number.isFinite(idx) && idx >= 0 && idx < mc) next[idx] = prev[idx];
      }
      return next;
    });

    setSuggestionsByIndex((prev) => {
      const next: Record<number, string[]> = {};
      for (const k of Object.keys(prev)) {
        const idx = Number(k);
        if (Number.isFinite(idx) && idx >= 0 && idx < mc) next[idx] = prev[idx];
      }
      return next;
    });
  }

  function autoFillWeek() {
    const favorites = recipes.filter((r) => r.favorite);
    const others = recipes.filter((r) => !r.favorite);
    const pool = [...shuffle(favorites), ...shuffle(others)];

    setSlots((prev) => {
      const next = prev.map((s) => ({ ...s }));
      for (let i = 0; i < next.length; i++) next[i].recipeId = pool[i]?.id ?? null;
      return next;
    });
  }

  async function clearWeek() {
    setSlots((prev) => prev.map((s) => ({ ...s, recipeId: null })));
    setSidesByIndex((prev) => prev.map(() => []));
    setSideDraftByIndex({});
    setSuggestionsByIndex({});

    const clearedPayload = JSON.stringify({
      start_date: weekStartStr,
      meal_count: mealCount,
      selected_recipe_ids: [],
    });
    latestPayloadRef.current = clearedPayload;

    await saveWeekNow({ silent: prefs.reduceChatter, keepalive: false, explicitClear: true });
    if (!prefs.reduceChatter) setCalmStatus("Cleared.", 800);
  }

  function moveSlot(idx: number, dir: -1 | 1) {
    setSlots((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

    setSidesByIndex((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

    setSideDraftByIndex((prev) => {
      const next = { ...prev };
      const j = idx + dir;
      if (j < 0) return prev;
      const a = next[idx] ?? "";
      const b = next[j] ?? "";
      if (a || b) {
        next[idx] = b;
        next[j] = a;
      }
      return next;
    });

    setSuggestionsByIndex((prev) => {
      const next = { ...prev };
      const j = idx + dir;
      if (j < 0) return prev;
      const a = next[idx] ?? [];
      const b = next[j] ?? [];
      if ((a && a.length) || (b && b.length)) {
        next[idx] = b;
        next[j] = a;
      }
      return next;
    });
  }

  // Auto-save (debounced) any time slots or mealCount change — AFTER hydration
  useEffect(() => {
    if (!weekStartStr) return;
    if (!weekHydrated) return;

    const payload = JSON.stringify({
      start_date: weekStartStr,
      meal_count: mealCount,
      selected_recipe_ids: selectedIdsForSave,
    });

    latestPayloadRef.current = payload;

    if (payload === lastSavedPayload.current) return;

    if (savingTimer.current) clearTimeout(savingTimer.current);

    savingTimer.current = setTimeout(async () => {
      await saveWeekNow({ silent: false, keepalive: false, explicitClear: false });
    }, 450);

    return () => {
      if (savingTimer.current) clearTimeout(savingTimer.current);
    };
  }, [slots, mealCount, weekStartStr, selectedIdsForSave, weekHydrated, prefs, brainCapacity]);

  // Flush pending save on unmount/navigation away — BUT NOT BEFORE hydration
  useEffect(() => {
    return () => {
      try {
        if (savingTimer.current) clearTimeout(savingTimer.current);
      } catch {}
      if (!weekHydrated) return;
      void saveWeekNow({ silent: true, keepalive: true, explicitClear: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekHydrated]);

  function setSideDraft(idx: number, v: string) {
    setSideDraftByIndex((p) => ({ ...p, [idx]: v }));
  }

  function addSide(idx: number, raw: string) {
    const cleaned = sanitizeSideInput(raw);
    if (!cleaned) return;

    setSidesByIndex((prev) => {
      const next = [...prev];
      const existing = next[idx] ?? [];
      next[idx] = uniqKeepOrder([...existing, cleaned]);
      return next;
    });

    setSideDraft(idx, "");
  }

  function removeSide(idx: number, side: string) {
    setSidesByIndex((prev) => {
      const next = [...prev];
      next[idx] = (next[idx] ?? []).filter((s) => s !== side);
      return next;
    });
  }

  function suggestSidesForRecipe(recipe: Recipe | null): string[] {
    if (!recipe) return [];
    const title = (recipe.title || "").toLowerCase();

    if (title.includes("spaghetti") || title.includes("pasta") || title.includes("lasagna")) {
      return ["salad", "garlic bread"];
    }
    if (title.includes("taco") || title.includes("burrito") || title.includes("mexican")) {
      return ["salad", "chips", "salsa"];
    }
    if (title.includes("steak") || title.includes("chicken") || title.includes("pork")) {
      return ["salad", "veggies", "potatoes"];
    }
    if (title.includes("soup") || title.includes("chili")) {
      return ["salad", "bread"];
    }
    return ["salad", "veggies", "bread"];
  }

  function runSuggest(idx: number) {
    const slot = slots[idx];
    const rid = slot?.recipeId;
    const recipe = rid ? recipeById.get(rid) ?? null : null;
    if (!recipe) return;

    const ideas = suggestSidesForRecipe(recipe);
    setSuggestionsByIndex((p) => ({ ...p, [idx]: ideas }));
  }

  async function syncShoppingList() {
    try {
      setCalmStatus(prefs.reduceChatter ? "Syncing…" : "Sending to shopping list…");

      const sideLines = sidesByIndex
        .flatMap((arr) => arr ?? [])
        .map(normalizeSideForShopping)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/shopping-list/sync-derived", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_ids: selectedIdsForSave,
          side_lines: sideLines,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error((json as any)?.error || "Sync failed");

      setCalmStatus(prefs.reduceChatter ? "Updated." : "Sent to your shopping list.", 1400);
    } catch (e: any) {
      setStatus(`${e?.message || "Sync error"}. Your list is unchanged.`);
    }
  }

  const header = (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
          {pageTitle}{" "}
          <span className="inline-block align-middle ml-2 h-2.5 w-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_24px_rgba(232,121,249,0.35)]" />
        </h1>

        <p className="mt-2 text-white/75 text-sm md:text-base">{flavorLine}</p>

        <div className="mt-1 text-xs md:text-sm text-white/55">
          Week: <span className="text-white/80 font-semibold">{weekStartStr}</span> →{" "}
          <span className="text-white/80 font-semibold">{weekEndStr}</span>
          {status ? <span className="text-white/55"> • {status}</span> : null}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => goToWeek(addDays(weekStart, -7))} className={btn}>
          ← Prev
        </button>
        <button type="button" onClick={() => goToWeek(new Date())} className={btn}>
          This week
        </button>
        <button type="button" onClick={() => goToWeek(addDays(weekStart, 7))} className={btn}>
          Next →
        </button>
      </div>
    </div>
  );

  const anySidesCount = useMemo(() => sidesByIndex.flatMap((x) => x ?? []).length, [sidesByIndex]);

  return (
    <RcPageShell header={header}>
      {/* Top action row */}
      <div className="mt-6 rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={clearWeek} className={btn} disabled={!weekHydrated}>
              Clear
            </button>

            <button
              type="button"
              onClick={autoFillWeek}
              className={btn}
              disabled={loadingRecipes || !!recipesError || recipes.length === 0 || !weekHydrated}
            >
              Auto-fill
            </button>

            <button
              type="button"
              onClick={syncShoppingList}
              className={btnPrimary}
              disabled={selectedIdsForSave.length === 0 && anySidesCount === 0}
              title="Adds ingredients to Shopping List"
            >
              Send to shopping list
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-white/60 text-sm">Meals:</span>
            <button
              type="button"
              className={iconBtn}
              onClick={() => applyMealCount(mealCount - 1)}
              disabled={!weekHydrated || mealCount <= 0}
              title="Fewer meals"
            >
              −
            </button>
            <div className="min-w-[28px] text-center font-extrabold text-white/85">{mealCount}</div>
            <button
              type="button"
              className={iconBtn}
              onClick={() => applyMealCount(mealCount + 1)}
              disabled={!weekHydrated || mealCount >= 60}
              title="More meals"
            >
              +
            </button>
          </div>
        </div>

        {isWeekEmpty ? (
          <div className="mt-3 text-sm text-white/60 whitespace-pre-line">{emptyCopy}</div>
        ) : null}
      </div>

      {/* Content */}
      {loadingRecipes ? (
        <div className="mt-6 text-white/70">Loading…</div>
      ) : recipesError ? (
        <div className="mt-6 text-red-300">{recipesError}</div>
      ) : (
        <div className="mt-6">
          {/* List container (like other pages) */}
          <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 overflow-hidden">
            {slots.map((slot, idx) => {
              const r = slot.recipeId ? recipeById.get(slot.recipeId) : null;
              const sides = sidesByIndex[idx] ?? [];
              const suggestions = suggestionsByIndex[idx] ?? [];

              return (
                <div
                  key={slot.slotId}
                  className={`px-4 py-4 md:px-5 md:py-4 ${
                    idx === 0 ? "" : "border-t border-white/10"
                  }`}
                >
                  {/* Row header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="text-white/90 font-extrabold tracking-tight text-lg">
                          Meal {idx + 1}
                        </div>
                        {r ? (
                          <Link href={`/recipes/${r.id}`} className={subtleLink}>
                            View
                          </Link>
                        ) : (
                          <span className="text-xs text-white/35">—</span>
                        )}
                      </div>

                      {!prefs.reduceChatter && r ? (
                        <div className="mt-1 text-[11px] text-white/35 truncate max-w-[520px]">
                          {r.id}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        className={iconBtn}
                        onClick={() => moveSlot(idx, -1)}
                        title="Move up"
                        disabled={idx === 0}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={iconBtn}
                        onClick={() => moveSlot(idx, 1)}
                        title="Move down"
                        disabled={idx === slots.length - 1}
                      >
                        ↓
                      </button>
                    </div>
                  </div>

                  {/* Main controls */}
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                    {/* Recipe select */}
                    <div className="min-w-0">
                      <select
                        value={slot.recipeId ?? ""}
                        onChange={(e) => {
                          const value = e.target.value || null;
                          setSlots((prev) =>
                            prev.map((s) => (s.slotId === slot.slotId ? { ...s, recipeId: value } : s))
                          );

                          // clear suggestions when recipe changes
                          setSuggestionsByIndex((p) => {
                            const next = { ...p };
                            delete next[idx];
                            return next;
                          });
                        }}
                        className="w-full rounded-2xl bg-[#0b1026] text-white ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                      >
                        <option value="">{prefs.reduceChatter ? "(none)" : "— none —"}</option>
                        {recipes.map((rec) => (
                          <option key={rec.id} value={rec.id}>
                            {rec.favorite ? "★ " : ""}
                            {rec.title}
                          </option>
                        ))}
                      </select>

                      {/* Sides line (compact) */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-extrabold text-white/65 tracking-wide">Sides</div>

                          <button
                            type="button"
                            className={subtleLink}
                            onClick={() => runSuggest(idx)}
                            disabled={!r}
                            title={r ? "Suggest sides" : "Pick a recipe to suggest"}
                            style={{ opacity: r ? 1 : 0.35, pointerEvents: r ? "auto" : "none" }}
                          >
                            Suggest
                          </button>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {sides.length ? (
                            sides.map((s) => (
                              <span key={s} className={pill}>
                                {s}
                                <button
                                  type="button"
                                  className="ml-2 text-white/55 hover:text-white/85"
                                  onClick={() => removeSide(idx, s)}
                                  title="Remove"
                                >
                                  ×
                                </button>
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-white/40">No sides yet.</span>
                          )}
                        </div>

                        {r && suggestions.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {suggestions.map((s) => (
                              <button
                                key={s}
                                type="button"
                                className="rounded-full border border-white/10 bg-white/0 hover:bg-white/5 px-3 py-1 text-xs font-semibold text-white/70 transition"
                                onClick={() => addSide(idx, s)}
                                title="Add side"
                              >
                                + {s}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-2 flex items-center gap-2">
                          <input
                            value={sideDraftByIndex[idx] ?? ""}
                            onChange={(e) => setSideDraft(idx, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addSide(idx, sideDraftByIndex[idx] ?? "");
                              }
                            }}
                            placeholder="Add a side… (e.g., salad)"
                            className={`flex-1 ${compactInput}`}
                          />

                          <button
                            type="button"
                            className="rounded-2xl bg-white/10 hover:bg-white/15 ring-1 ring-white/10 px-3 py-2 text-sm font-extrabold text-white/80 transition disabled:opacity-50"
                            onClick={() => addSide(idx, sideDraftByIndex[idx] ?? "")}
                            disabled={!sanitizeSideInput(sideDraftByIndex[idx] ?? "")}
                            title="Add side"
                          >
                            Add
                          </button>
                        </div>

                        {(() => {
                          const v = (sideDraftByIndex[idx] ?? "").toLowerCase();
                          if (!v) return null;
                          if (v.includes("salad")) {
                            return (
                              <div className="mt-2 text-[11px] text-white/35">
                                Shopping list will use: “salad kit”.
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>

                    {/* right-side micro meta (optional space, keeps list airy) */}
                    <div className="hidden md:block md:pl-2">
                      <div className="text-[11px] text-white/35">
                        {r ? "Picked" : "Not picked"}
                        {sides.length ? ` • ${sides.length} side${sides.length === 1 ? "" : "s"}` : ""}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </RcPageShell>
  );
}
