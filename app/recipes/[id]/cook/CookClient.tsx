"use client";

import { useMemo, useState } from "react";

type IngredientIndexEntry = {
  idx: number;
  original: string;
  tokens: string[];
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "or",
  "the",
  "to",
  "of",
  "for",
  "in",
  "on",
  "with",
  "into",
  "over",
  "at",
  "from",
  "as",
  "is",
  "are",
  "be",
  "been",
  "being",
  "then",
  "than",
  "until",
  "about",
  "after",
  "before",
  "between",
  "through",
  "while",
  "once",
  "let",
  "use",
  "using",
]);

const MEASURE_WORDS = new Set([
  "tsp",
  "teaspoon",
  "teaspoons",
  "tbsp",
  "tablespoon",
  "tablespoons",
  "cup",
  "cups",
  "pint",
  "pints",
  "quart",
  "quarts",
  "gallon",
  "gallons",
  "ml",
  "l",
  "liter",
  "liters",
  "g",
  "gram",
  "grams",
  "kg",
  "kilogram",
  "kilograms",
  "oz",
  "ounce",
  "ounces",
  "lb",
  "lbs",
  "pound",
  "pounds",
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
  "stick",
  "sticks",
  "large",
  "medium",
  "small",
  "divided",
  "optional",
]);

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  const n = normalizeText(s);
  if (!n) return [];
  return n.split(" ").map((t) => t.trim()).filter(Boolean);
}

function cleanIngredientTokens(ingredientLine: string): string[] {
  const tokens = tokenize(ingredientLine);
  const filtered = tokens.filter((t) => !/^\d+([\/.-]\d+)?$/.test(t));

  const keep: string[] = [];
  for (const t of filtered) {
    if (STOP_WORDS.has(t)) continue;
    if (MEASURE_WORDS.has(t)) continue;
    if (t.length <= 2) continue;
    keep.push(t);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of keep) {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function buildIngredientIndex(ingredients: string[]): IngredientIndexEntry[] {
  return ingredients.map((ing, idx) => ({
    idx,
    original: ing,
    tokens: cleanIngredientTokens(ing),
  }));
}

function scoreIngredientMatch(stepTokensSet: Set<string>, entry: IngredientIndexEntry): number {
  let score = 0;
  for (const t of entry.tokens) {
    if (stepTokensSet.has(t)) score += 1;
  }
  return score;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, highlightTokens: string[]): React.ReactNode {
  if (!text) return text;

  const tokens = Array.from(new Set(highlightTokens))
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3)
    .sort((a, b) => b.length - a.length);

  if (tokens.length === 0) return text;

  const pattern = tokens.map(escapeRegExp).join("|");
  const re = new RegExp(`\\b(${pattern})\\b`, "gi");

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(re)) {
    const idx = match.index ?? 0;
    const found = match[0];

    if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));

    parts.push(
      <mark
        key={`${idx}-${found}`}
        style={{
          background: "rgba(236, 72, 153, 0.18)",
          padding: "0 4px",
          borderRadius: 6,
        }}
      >
        {found}
      </mark>
    );

    lastIndex = idx + found.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return parts.length ? parts : text;
}

export default function CookClient({ ingredients, steps }: { ingredients: string[]; steps: string[] }) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [activeStep, setActiveStep] = useState(0);

  // Defaults tuned for "clean cooking screen"
  const [showAllIfNoneReferenced, setShowAllIfNoneReferenced] = useState(false);
  const [highlightIngredientsInStep, setHighlightIngredientsInStep] = useState(true);
  const [showFullIngredientChecklist, setShowFullIngredientChecklist] = useState(false);

  const hasSteps = steps.length > 0;
  const hasIngredients = ingredients.length > 0;

  const safeActive = useMemo(() => {
    if (!hasSteps) return 0;
    return Math.min(Math.max(activeStep, 0), steps.length - 1);
  }, [activeStep, hasSteps, steps.length]);

  const ingredientIndex = useMemo(() => buildIngredientIndex(ingredients), [ingredients]);

  const activeText = useMemo(() => {
    if (!hasSteps) return "";
    return steps[safeActive] ?? "";
  }, [hasSteps, safeActive, steps]);

  const stepIngredientMatches = useMemo(() => {
    if (!hasSteps || !hasIngredients) return [] as IngredientIndexEntry[];

    const stepTokens = tokenize(activeText);
    const stepTokenSet = new Set(stepTokens);

    const scored = ingredientIndex
      .map((entry) => ({ entry, score: scoreIngredientMatch(stepTokenSet, entry) }))
      .filter((x) => x.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.entry);
  }, [hasSteps, hasIngredients, activeText, ingredientIndex]);

  const ingredientsToShowForStep = useMemo(() => {
    if (!hasIngredients) return [] as IngredientIndexEntry[];
    if (stepIngredientMatches.length > 0) return stepIngredientMatches;
    return showAllIfNoneReferenced ? ingredientIndex : [];
  }, [hasIngredients, stepIngredientMatches, showAllIfNoneReferenced, ingredientIndex]);

  const highlightTokensForStep = useMemo(() => {
    if (!highlightIngredientsInStep) return [];
    const toks: string[] = [];
    for (const e of stepIngredientMatches) toks.push(...e.tokens);
    return Array.from(new Set(toks)).filter((t) => t.length >= 3);
  }, [highlightIngredientsInStep, stepIngredientMatches]);

  function toggleChecked(idx: number, value?: boolean) {
    setChecked((prev) => {
      const next = { ...prev };
      const current = Boolean(next[idx]);
      next[idx] = typeof value === "boolean" ? value : !current;
      return next;
    });
  }

  return (
    <div
      style={{
        maxWidth: 980,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Controls row */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", opacity: 0.95 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={showAllIfNoneReferenced}
            onChange={(e) => setShowAllIfNoneReferenced(e.target.checked)}
          />
          Show all ingredients when none referenced
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={highlightIngredientsInStep}
            onChange={(e) => setHighlightIngredientsInStep(e.target.checked)}
          />
          Highlight ingredient words in step
        </label>

        {hasIngredients ? (
          <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showFullIngredientChecklist}
              onChange={(e) => setShowFullIngredientChecklist(e.target.checked)}
            />
            Show full ingredient checklist
          </label>
        ) : null}
      </div>

      {/* Step panel */}
      <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 16, padding: 16 }}>
        <h2 style={{ fontSize: 28, margin: 0 }}>Steps</h2>

        {!hasSteps ? (
          <div style={{ marginTop: 10, opacity: 0.7 }}>No instructions yet.</div>
        ) : (
          <>
            <div style={{ marginTop: 12, padding: 14, borderRadius: 14, background: "rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 8 }}>
                Step {safeActive + 1} of {steps.length}
              </div>

              {/* Step ingredients */}
              <div
                style={{
                  marginBottom: 10,
                  padding: 12,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(0,0,0,0.08)",
                }}
              >
                <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 6 }}>
                  Ingredients for this step{" "}
                  {stepIngredientMatches.length === 0 ? (
                    <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.6 }}>(none referenced)</span>
                  ) : null}
                </div>

                {!hasIngredients ? (
                  <div style={{ fontSize: 16, opacity: 0.7 }}>No ingredients yet.</div>
                ) : ingredientsToShowForStep.length === 0 ? (
                  <div style={{ fontSize: 16, opacity: 0.7 }}>None referenced in this step.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {ingredientsToShowForStep.map((m) => (
                      <label
                        key={`step-ing-${m.idx}`}
                        style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(checked[m.idx])}
                          onChange={(e) => toggleChecked(m.idx, e.target.checked)}
                          style={{ marginTop: 3 }}
                        />
                        <span style={{ fontSize: 16, lineHeight: 1.35, opacity: checked[m.idx] ? 0.55 : 1 }}>
                          {m.original}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Step text */}
              <div style={{ fontSize: 24, lineHeight: 1.35 }}>
                {highlightIngredientsInStep ? highlightText(activeText, highlightTokensForStep) : activeText}
              </div>
            </div>

            {/* Navigation */}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
                disabled={safeActive <= 0}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.18)",
                  cursor: safeActive <= 0 ? "not-allowed" : "pointer",
                  opacity: safeActive <= 0 ? 0.55 : 1,
                }}
              >
                ← Prev
              </button>

              <button
                type="button"
                onClick={() => setActiveStep((s) => Math.min(steps.length - 1, s + 1))}
                disabled={safeActive >= steps.length - 1}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.18)",
                  cursor: safeActive >= steps.length - 1 ? "not-allowed" : "pointer",
                  opacity: safeActive >= steps.length - 1 ? 0.55 : 1,
                }}
              >
                Next →
              </button>
            </div>

            {/* Optional: full ingredient checklist (collapsed behind toggle) */}
            {showFullIngredientChecklist && hasIngredients ? (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(0,0,0,0.10)" }}>
                <h3 style={{ margin: "0 0 10px 0", fontSize: 18, opacity: 0.9 }}>Full ingredient checklist</h3>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {ingredients.map((ing, idx) => (
                    <label key={`${ing}-${idx}`} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(checked[idx])}
                        onChange={(e) => toggleChecked(idx, e.target.checked)}
                        style={{ marginTop: 4 }}
                      />
                      <span style={{ fontSize: 16, lineHeight: 1.35, opacity: checked[idx] ? 0.55 : 1 }}>
                        {ing}
                      </span>
                    </label>
                  ))}

                  <button
                    type="button"
                    onClick={() => setChecked({})}
                    style={{
                      marginTop: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.18)",
                      cursor: "pointer",
                      width: "fit-content",
                    }}
                  >
                    Reset checks
                  </button>
                </div>
              </div>
            ) : null}

            {/* All steps */}
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", opacity: 0.8 }}>All steps</summary>
              <ol style={{ marginTop: 10, paddingLeft: 18, lineHeight: 1.6 }}>
                {steps.map((s, idx) => (
                  <li key={`${s}-${idx}`} style={{ marginBottom: 8 }}>
                    <button
                      type="button"
                      onClick={() => setActiveStep(idx)}
                      style={{
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        cursor: "pointer",
                        textAlign: "left",
                        fontSize: 16,
                        opacity: idx === safeActive ? 1 : 0.78,
                        textDecoration: idx === safeActive ? "underline" : "none",
                      }}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ol>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
