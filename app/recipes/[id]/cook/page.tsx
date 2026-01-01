// app/recipes/[id]/cook/page.tsx
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Recipe = {
  id: string;
  title?: string | null;
  description?: string | null;
  steps?: string[] | null;
  ingredients?: string[] | null;
};

type ApiResponse = {
  recipe: Recipe;
};

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSteps(recipe: Recipe | null): string[] {
  if (!recipe) return [];
  if (Array.isArray(recipe.steps)) {
    return recipe.steps.map((s) => String(s).trim()).filter(Boolean);
  }
  return [];
}

function normalizeIngredients(recipe: Recipe | null): string[] {
  if (!recipe) return [];
  if (Array.isArray(recipe.ingredients)) {
    return recipe.ingredients.map((i) => String(i).trim()).filter(Boolean);
  }
  return [];
}

// Light ingredient mention detection (assist-only)
const UNIT_WORDS = new Set([
  "cup",
  "cups",
  "tbsp",
  "tablespoon",
  "tablespoons",
  "tsp",
  "teaspoon",
  "teaspoons",
  "oz",
  "ounce",
  "ounces",
  "lb",
  "lbs",
  "pound",
  "pounds",
  "gram",
  "grams",
  "kg",
  "ml",
  "l",
  "liter",
  "liters",
  "pinch",
  "dash",
  "clove",
  "cloves",
  "slice",
  "slices",
  "can",
  "cans",
  "package",
  "packages",
  "packet",
  "packets",
  "small",
  "medium",
  "large",
  "fresh",
  "dried",
  "chopped",
  "minced",
  "ground",
  "to",
  "taste",
  "and",
  "or",
  "of",
  "a",
  "an",
  "the",
  "as",
  "needed",
]);

function stripLeadingQuantity(s: string): string {
  // handles:
  // "1½ pounds steak" (½ becomes non-ascii but that's okay after norm)
  // "1 1/2 cups flour"
  // "2 tbsp sugar"
  // "0.5 tsp salt"
  return s
    .replace(/^\s*\d+([\/\.\s]\d+)?\s*/, "")
    .replace(/^\s*\d+\s+\d+\/\d+\s*/, "")
    .trim();
}

function splitIngredientAliases(rawLine: string): string[] {
  // We want possible “names” an ingredient might be referred to as.
  // Examples:
  // "1½ pounds sirloin steak (or strip loin or ribeye)"
  // -> ["sirloin steak", "strip loin", "ribeye"]
  // "salt and black pepper (or steak spice, to taste )"
  // -> ["salt", "black pepper", "steak spice"]
  const line = rawLine || "";
  const parenMatches = Array.from(line.matchAll(/\(([^)]+)\)/g)).map((m) => m[1] || "");
  const withoutParens = line.replace(/\([^)]+\)/g, " ");

  const buckets = [withoutParens, ...parenMatches]
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const aliases: string[] = [];

  for (const b of buckets) {
    // split on common separators + "or"
    const parts = b
      .split(/,|;|\/|\bor\b/gi)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const p0 of parts) {
      let p = stripLeadingQuantity(p0);

      // remove trailing "to taste" / "as needed" etc
      p = p.replace(/\bto taste\b/gi, "").replace(/\bas needed\b/gi, "").trim();

      // if "salt and pepper" style, keep both as separate aliases too
      const andParts = p
        .split(/\band\b/gi)
        .map((x) => x.trim())
        .filter(Boolean);

      if (andParts.length > 1) {
        for (const ap of andParts) {
          const clean = ap.trim();
          if (clean) aliases.push(clean);
        }
        // also include the combined phrase
        aliases.push(p);
      } else {
        if (p) aliases.push(p);
      }
    }
  }

  // normalize + dedupe
  const dedup = new Set<string>();
  for (const a of aliases) {
    const n = norm(a);
    if (n) dedup.add(n);
  }

  return Array.from(dedup);
}

function tokensAndPhrases(aliasNorm: string): string[] {
  // keep meaningful short words like "oil"
  const toks = aliasNorm
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 2)
    .filter((t) => !UNIT_WORDS.has(t));

  const phrases: string[] = [];
  for (let i = 0; i < toks.length - 1; i++) {
    phrases.push(`${toks[i]} ${toks[i + 1]}`);
  }

  // prioritize phrases first (more specific), then tokens
  return [...phrases, ...toks].slice(0, 10);
}

function stepMentionsIngredient(step: string, ingredientLine: string): boolean {
  const stepN = norm(step);
  if (!stepN) return false;

  const aliases = splitIngredientAliases(ingredientLine);
  if (aliases.length === 0) return false;

  for (const alias of aliases) {
    const candidates = tokensAndPhrases(alias);
    if (candidates.length === 0) continue;

    // If any candidate appears in the step, we count it as mentioned.
    // This is “light assist” so false positives are okay-ish, but we keep it reasonable.
    if (candidates.some((c) => stepN.includes(c))) return true;
  }

  return false;
}

type IngredientRow = {
  idx: number;
  text: string;
  checked: boolean;
  highlighted: boolean;
  seenInPastStep: boolean;
};

export default function CookPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [checkedIngredients, setCheckedIngredients] = useState<Record<number, boolean>>({});
  const [showCompletionReminder, setShowCompletionReminder] = useState(false);

  const [keepAwake, setKeepAwake] = useState(false);
  const [wakeLock, setWakeLock] = useState<any>(null);

  // kept (harmless for web): ingredients drawer
  const [ingredientsOpen, setIngredientsOpen] = useState(false);

  // Track ingredients that were highlighted in any step you already advanced past
  const [seenIngredientIdxs, setSeenIngredientIdxs] = useState<Record<number, true>>({});

  // Fetch recipe
  useEffect(() => {
    if (!id) return;

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/recipes/${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal: ac.signal,
    })
      .then((r) => r.json())
      .then((data: ApiResponse) => {
        if (!data?.recipe) throw new Error("Recipe not found");
        setRecipe(data.recipe);

        // Reset per-recipe state
        setStepIndex(0);
        setCheckedIngredients({});
        setShowCompletionReminder(false);
        setSeenIngredientIdxs({});
      })
      .catch((e) => {
        if (e?.name !== "AbortError") {
          setError(e?.message ?? "Failed to load recipe");
        }
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [id]);

  // Wake Lock
  useEffect(() => {
    if (!keepAwake) {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
        setWakeLock(null);
      }
      return;
    }

    let active = true;

    if ("wakeLock" in navigator) {
      // @ts-ignore
      navigator.wakeLock
        .request("screen")
        .then((lock: any) => {
          if (!active) {
            lock.release();
            return;
          }
          setWakeLock(lock);
          lock.addEventListener?.("release", () => {});
        })
        .catch(() => {});
    }

    return () => {
      active = false;
    };
  }, [keepAwake, wakeLock]);

  const steps = useMemo(() => normalizeSteps(recipe), [recipe]);
  const ingredients = useMemo(() => normalizeIngredients(recipe), [recipe]);

  const totalSteps = steps.length;
  const isLastStep = totalSteps > 0 && stepIndex === totalSteps - 1;

  const uncheckedIngredientCount = useMemo(() => {
    return ingredients.filter((_, idx) => !checkedIngredients[idx]).length;
  }, [ingredients, checkedIngredients]);

  const currentStepText = steps[stepIndex] || "";

  const highlightedIngredientIdxs = useMemo(() => {
    if (!currentStepText || ingredients.length === 0) return new Set<number>();
    const set = new Set<number>();
    ingredients.forEach((ing, idx) => {
      if (stepMentionsIngredient(currentStepText, ing)) set.add(idx);
    });
    return set;
  }, [currentStepText, ingredients]);

  const ingredientRows = useMemo<IngredientRow[]>(() => {
    return ingredients.map((text, idx) => ({
      idx,
      text,
      checked: !!checkedIngredients[idx],
      highlighted: highlightedIngredientIdxs.has(idx),
      seenInPastStep: !!seenIngredientIdxs[idx],
    }));
  }, [ingredients, checkedIngredients, highlightedIngredientIdxs, seenIngredientIdxs]);

  const ingredientSections = useMemo(() => {
    const upNext: IngredientRow[] = [];
    const missed: IngredientRow[] = [];
    const later: IngredientRow[] = [];
    const done: IngredientRow[] = [];

    for (const row of ingredientRows) {
      if (row.checked) {
        done.push(row);
      } else if (row.highlighted) {
        upNext.push(row);
      } else if (row.seenInPastStep) {
        missed.push(row);
      } else {
        later.push(row);
      }
    }

    const byIdx = (a: IngredientRow, b: IngredientRow) => a.idx - b.idx;
    upNext.sort(byIdx);
    missed.sort(byIdx);
    later.sort(byIdx);
    done.sort(byIdx);

    return { upNext, missed, later, done };
  }, [ingredientRows]);

  function goBackToRecipe() {
    if (!recipe?.id) return;
    router.push(`/recipes/${recipe.id}`);
  }

  function markCurrentHighlightsAsSeen() {
    if (highlightedIngredientIdxs.size === 0) return;

    setSeenIngredientIdxs((prev) => {
      const next = { ...prev };
      highlightedIngredientIdxs.forEach((idx) => {
        next[idx] = true;
      });
      return next;
    });
  }

  function handleNextOrDone() {
    if (totalSteps === 0) return;

    if (isLastStep) {
      markCurrentHighlightsAsSeen();

      if (uncheckedIngredientCount > 0) {
        setShowCompletionReminder(true);
        return;
      }
      goBackToRecipe();
      return;
    }

    markCurrentHighlightsAsSeen();

    setShowCompletionReminder(false);
    setStepIndex((i) => Math.min(totalSteps - 1, i + 1));
  }

  function handlePrev() {
    setStepIndex((i) => Math.max(0, i - 1));
    setShowCompletionReminder(false);
  }

  function IngredientList({ compact }: { compact?: boolean }) {
    const checkboxClass = compact
      ? "mt-0.5 h-5 w-5 accent-teal-500"
      : "mt-0.5 h-4 w-4 accent-teal-500";

    const Section = ({
      label,
      rows,
      tone,
      hint,
    }: {
      label: string;
      rows: IngredientRow[];
      tone: "teal" | "amber" | "neutral";
      hint?: string;
    }) => {
      if (rows.length === 0) return null;

      const labelColor =
        tone === "teal"
          ? "text-teal-200/80"
          : tone === "amber"
          ? "text-amber-200/75"
          : "text-white/55";

      return (
        <div className="mt-4 first:mt-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className={`text-[11px] font-extrabold tracking-wider uppercase ${labelColor}`}>
              {label}
              <span className="ml-2 text-white/35 font-bold normal-case">({rows.length})</span>
            </div>
            {hint ? <div className="text-xs text-white/40">{hint}</div> : null}
          </div>

          <ul className="space-y-2">
            {rows.map((row) => {
              const highlighted = row.highlighted && !row.checked;
              const checked = row.checked;
              const missed = !checked && !highlighted && row.seenInPastStep;

              const frame = missed
                ? "bg-amber-500/5 ring-amber-400/20"
                : highlighted
                ? "bg-teal-500/10 ring-teal-400/30"
                : "bg-white/0 ring-white/10";

              return (
                <li
                  key={row.idx}
                  className={["flex items-start gap-3 rounded-2xl ring-1 transition px-3 py-2", frame].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setCheckedIngredients((prev) => ({
                        ...prev,
                        [row.idx]: e.target.checked,
                      }))
                    }
                    className={checkboxClass}
                  />
                  <span className={checked ? "text-white/45 line-through" : "text-white/85"}>
                    {row.text}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      );
    };

    return (
      <div>
        <Section label="Up next" rows={ingredientSections.upNext} tone="teal" hint="Mentioned in this step" />
        <Section label="Missed" rows={ingredientSections.missed} tone="amber" hint="Mentioned earlier" />
        <Section label="Later" rows={ingredientSections.later} tone="neutral" />
        <Section label="Done" rows={ingredientSections.done} tone="neutral" />
      </div>
    );
  }

  const pill =
    "inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/15 px-5 py-2.5 text-sm font-semibold ring-1 ring-white/10 transition";
  const actionBtn =
    "rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3 text-sm font-semibold ring-1 ring-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed";

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050816] text-white">
        <div className="max-w-6xl mx-auto px-4 py-10 text-white/70">Loading…</div>
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="min-h-screen bg-[#050816] text-white">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="rounded-2xl border border-red-500/30 bg-red-950/40 px-5 py-4 text-red-100">
            {error ?? "Recipe not available"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="sticky top-0 z-50 border-b border-white/10 bg-[#050816]/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/recipes/${recipe.id}`} className={pill}>
                ← Back
              </Link>
              <Link href="/recipes" className={pill}>
                All recipes
              </Link>

              {ingredients.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setIngredientsOpen(true)}
                  className={`${pill} md:hidden`}
                  title="Open ingredients"
                >
                  Ingredients <span className="text-white/50 text-xs">({ingredients.length})</span>
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="hidden sm:block text-xs text-white/50">
                {totalSteps > 0 ? `Step ${stepIndex + 1} / ${totalSteps}` : "No steps"}
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-white/75 select-none">
                <input
                  type="checkbox"
                  checked={keepAwake}
                  onChange={(e) => setKeepAwake(e.target.checked)}
                  className="h-4 w-4 accent-fuchsia-500"
                />
                Keep awake
              </label>

              <button onClick={handlePrev} disabled={stepIndex === 0} className={actionBtn}>
                Prev
              </button>

              <button onClick={handleNextOrDone} className={actionBtn}>
                {isLastStep ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">{recipe.title || "Recipe"}</h1>
        {recipe.description ? <p className="mt-3 max-w-2xl text-white/75">{recipe.description}</p> : null}

        <div className="mt-8 grid gap-6 md:grid-cols-[1fr_360px]">
          <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-7 md:p-10 shadow-lg shadow-black/20">
            {totalSteps === 0 ? (
              <div className="text-white/70">No steps available.</div>
            ) : (
              <>
                <div className="mb-4 text-xs tracking-wide text-white/50">
                  STEP {stepIndex + 1} OF {totalSteps}
                </div>

                <div className="rounded-3xl bg-black/30 ring-1 ring-white/10 p-6 md:p-8">
                  <div className="text-xl md:text-2xl leading-relaxed text-white/90">{steps[stepIndex]}</div>
                </div>
              </>
            )}

            {showCompletionReminder ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5 text-sm text-white/85">
                <div>
                  <span className="font-semibold">Just a heads up:</span> {uncheckedIngredientCount} ingredient
                  {uncheckedIngredientCount === 1 ? "" : "s"} weren’t checked.
                </div>

                <div className="mt-4">
                  <button
                    onClick={goBackToRecipe}
                    className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
                  >
                    Yeah, yeah — got it
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {ingredients.length > 0 ? (
            <aside className="hidden md:block">
              <div className="sticky top-[88px] rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-extrabold">Ingredients</h2>
                  <div className="text-xs text-white/50">Up next / missed / later / done</div>
                </div>

                <div className="mt-4 max-h-[60vh] overflow-auto pr-1">
                  <IngredientList />
                </div>

                <div className="mt-4 text-xs text-white/50">
                  If an ingredient shows up in a step and you move on unchecked, it quietly goes to <b>Missed</b>.
                </div>
              </div>
            </aside>
          ) : null}
        </div>

        {totalSteps > 0 ? (
          <div className="sticky bottom-0 z-40 mt-10 border-t border-white/10 bg-[#050816]/90 backdrop-blur">
            <div className="max-w-6xl mx-auto px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <button onClick={handlePrev} disabled={stepIndex === 0} className={actionBtn}>
                  Previous
                </button>

                <button onClick={handleNextOrDone} className={actionBtn}>
                  {isLastStep ? "Done" : "Next"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Drawer kept */}
      {ingredients.length > 0 ? (
        <>
          {ingredientsOpen ? (
            <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setIngredientsOpen(false)} />
          ) : null}

          <div
            className={[
              "fixed left-0 right-0 bottom-0 z-[70] md:hidden transition-transform duration-200",
              ingredientsOpen ? "translate-y-0" : "translate-y-full",
            ].join(" ")}
            aria-hidden={!ingredientsOpen}
          >
            <div className="rounded-t-3xl bg-[#050816] ring-1 ring-white/10 shadow-2xl">
              <div className="px-4 py-4 flex items-center justify-between border-b border-white/10">
                <div>
                  <div className="text-lg font-extrabold">Ingredients</div>
                  <div className="text-xs text-white/50">Up next / missed / later / done</div>
                </div>

                <button
                  type="button"
                  onClick={() => setIngredientsOpen(false)}
                  className="rounded-full bg-white/10 hover:bg-white/15 px-4 py-2 text-sm font-semibold ring-1 ring-white/10"
                >
                  Close
                </button>
              </div>

              <div className="max-h-[70vh] overflow-auto px-4 py-4">
                <IngredientList compact />
              </div>

              <div className="px-4 py-4 border-t border-white/10 flex items-center justify-between">
                <div className="text-xs text-white/50">
                  Unchecked: <span className="text-white/80">{uncheckedIngredientCount}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setIngredientsOpen(false)}
                  className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
                >
                  Back to steps
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
