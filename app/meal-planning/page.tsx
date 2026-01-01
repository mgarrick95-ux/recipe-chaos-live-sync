// RecipeChaos MP-PAGE-v6 — meal_count slots + hydration latch + explicit clear (2025-12-28)
// app/meal-planning/page.tsx
"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import BrainCapacityPrompt from "../../components/BrainCapacityPrompt";
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

// Tiny deterministic “rotation” so it changes per week, not per refresh.
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

export default function MealPlanningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { prefs, brainCapacity } = useUIPrefs();

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

  // Autosave infra
  const savingTimer = useRef<any>(null);
  const lastSavedPayload = useRef<string>("");

  // keep “latest desired save” in a ref so we can flush on navigation/unmount
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

  const pageTitle = t("WEEKLY_TITLE", prefs, brainCapacity);
  const emptyCopy = t("WEEKLY_EMPTY", prefs, brainCapacity);

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
      setStatus(msg.length > 18 ? t("GENERIC_UPDATED", prefs, brainCapacity) : msg);
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
            name: t("WEEKLY_TITLE", prefs, brainCapacity),
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

      // Treat "ignored empty save" as done for this payload to prevent retry spam.
      lastSavedPayload.current = payloadStr;

      if (!silent && mountedRef.current) {
        const brainMsg =
          brainCapacity === "very_little"
            ? "Saved."
            : brainCapacity === "some"
            ? "Saved."
            : brainCapacity === "extra"
            ? "Saved."
            : "Saved.";

        setCalmStatus(prefs.reduceChatter ? "Saved." : brainMsg, 900);
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

        const res = await fetch(`/api/meal-plans/current?start=${weekStartStr}`, {
          cache: "no-store",
        });
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
    // Intentional + persistent clear
    setSlots((prev) => prev.map((s) => ({ ...s, recipeId: null })));

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

  async function syncShoppingList() {
    try {
      setCalmStatus(prefs.reduceChatter ? "Syncing…" : "Sending to shopping list…");

      const res = await fetch("/api/shopping-list/sync-derived", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe_ids: selectedIdsForSave }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error((json as any)?.error || "Sync failed");

      setCalmStatus(prefs.reduceChatter ? "Updated." : "Sent to your shopping list.", 1400);
    } catch (e: any) {
      setStatus(`${e?.message || "Sync error"}. Your list is unchanged.`);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <BrainCapacityPrompt />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 46, margin: 0 }}>{pageTitle}</h1>
          <p style={{ marginTop: 10, fontSize: 16, opacity: 0.85 }}>{flavorLine}</p>

          <div style={{ marginTop: 8, opacity: 0.75 }}>
            Week: <b>{weekStartStr}</b> → <b>{weekEndStr}</b>
            {status ? <span style={{ marginLeft: 10 }}>• {status}</span> : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => goToWeek(addDays(weekStart, -7))} style={btnGhost} type="button">
            ← Prev
          </button>
          <button onClick={() => goToWeek(new Date())} style={btnGhost} type="button">
            This week
          </button>
          <button onClick={() => goToWeek(addDays(weekStart, 7))} style={btnGhost} type="button">
            Next →
          </button>

          <Link href={`/meal-planning/auto?start=${weekStartStr}`} style={btnDarkLink}>
            Smart
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={clearWeek} style={btnGhost} type="button">
          Clear
        </button>

        <button
          onClick={autoFillWeek}
          style={btnGhost}
          disabled={loadingRecipes || !!recipesError || recipes.length === 0}
          type="button"
        >
          Auto-fill
        </button>

        <button onClick={syncShoppingList} style={btnGhost} type="button" disabled={selectedIdsForSave.length === 0}>
          Send to shopping list
        </button>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 6 }}>
          <span style={{ opacity: 0.8 }}>Meals:</span>
          <button
            type="button"
            style={miniBtn}
            onClick={() => applyMealCount(mealCount - 1)}
            disabled={!weekHydrated || mealCount <= 0}
            title="Fewer meals"
          >
            −
          </button>
          <div style={{ minWidth: 34, textAlign: "center", fontWeight: 800 }}>{mealCount}</div>
          <button
            type="button"
            style={miniBtn}
            onClick={() => applyMealCount(mealCount + 1)}
            disabled={!weekHydrated || mealCount >= 60}
            title="More meals"
          >
            +
          </button>
        </div>
      </div>

      {isWeekEmpty ? (
        <div style={{ marginTop: 18, opacity: 0.78, whiteSpace: "pre-line" }}>{emptyCopy}</div>
      ) : null}

      {loadingRecipes ? (
        <div style={{ marginTop: 18, opacity: 0.7 }}>Loading…</div>
      ) : recipesError ? (
        <div style={{ marginTop: 18, color: "salmon" }}>{recipesError}</div>
      ) : (
        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 14,
          }}
        >
          {slots.map((slot, idx) => {
            const r = slot.recipeId ? recipeById.get(slot.recipeId) : null;

            return (
              <div key={slot.slotId} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>Meal {idx + 1}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => moveSlot(idx, -1)} style={miniBtn} title="Move up" type="button">
                      ↑
                    </button>
                    <button onClick={() => moveSlot(idx, 1)} style={miniBtn} title="Move down" type="button">
                      ↓
                    </button>
                  </div>
                </div>

                <select
                  value={slot.recipeId ?? ""}
                  onChange={(e) => {
                    const value = e.target.value || null;
                    setSlots((prev) =>
                      prev.map((s) => (s.slotId === slot.slotId ? { ...s, recipeId: value } : s))
                    );
                  }}
                  style={select}
                >
                  <option value="">{prefs.reduceChatter ? "(none)" : "— none —"}</option>
                  {recipes.map((rec) => (
                    <option key={rec.id} value={rec.id}>
                      {rec.favorite ? "★ " : ""}
                      {rec.title}
                    </option>
                  ))}
                </select>

                {r ? (
                  <div style={{ marginTop: 10, opacity: 0.85 }}>
                    <Link href={`/recipes/${r.id}`} style={{ textDecoration: "underline" }}>
                      View recipe
                    </Link>
                    {!prefs.reduceChatter ? (
                      <span style={{ marginLeft: 10, fontSize: 12, opacity: 0.6 }}>{r.id}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const btnGhost: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--chip)",
  color: "var(--text)",
  cursor: "pointer",
};

const btnDarkLink: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.14)",
  color: "var(--text)",
  textDecoration: "none",
};

const card: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 16,
  background: "var(--card)",
};

const select: React.CSSProperties = {
  width: "100%",
  marginTop: 10,
  padding: "12px 12px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  fontSize: 16,
  background: "rgba(255,255,255,0.06)",
  color: "var(--text)",
};

const miniBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.06)",
  color: "var(--text)",
  cursor: "pointer",
};
