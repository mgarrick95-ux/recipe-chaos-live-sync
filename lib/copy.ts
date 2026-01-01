// lib/copy.ts
// RecipeChaos copy system (tone + brain capacity aware)
// Goal: NEVER crash. Missing keys must degrade gracefully.

export type Tone = "gentle" | "snark_lite" | "minimal" | "spicy";
export type BrainCapacity = "very_little" | "some" | "normal" | "extra";

export type UIPrefsLike = {
  tone?: Tone;
  reduceChatter?: boolean;
};

type CopyEntry = {
  minimal: string;

  gentle?: string;
  snark_lite?: string;
  spicy?: string;

  // Optional overrides based on brain capacity (only used if present)
  byBrain?: Partial<Record<BrainCapacity, Partial<Record<Tone | "minimal", string>>>>;
};

type CopyMap = Record<string, CopyEntry>;

const COPY: CopyMap = {
  // ---------- Generic / system ----------
  GENERIC_UPDATED: {
    minimal: "Updated.",
    gentle: "Updated.",
    snark_lite: "Updated. You’re good.",
    spicy: "Updated. Chaos contained.",
  },

  // ---------- Brain capacity labels ----------
  BRAIN_VERY_LITTLE: {
    minimal: "Very little",
    gentle: "Very little",
    snark_lite: "Very little (survival mode)",
    spicy: "Very little (barely alive)",
  },
  BRAIN_SOME: {
    minimal: "Some",
    gentle: "Some",
    snark_lite: "Some (low power)",
    spicy: "Some (battery saver)",
  },
  BRAIN_NORMAL: {
    minimal: "Normal",
    gentle: "Normal",
    snark_lite: "Normal (business as usual)",
    spicy: "Normal (dangerously functional)",
  },
  BRAIN_EXTRA: {
    minimal: "Extra",
    gentle: "Extra",
    snark_lite: "Extra (we’ve got juice)",
    spicy: "Extra (are you sure?)",
  },

  // ---------- Weekly list ----------
  WEEKLY_TITLE: {
    minimal: "Weekly List",
    gentle: "Weekly List",
    snark_lite: "Weekly List",
    spicy: "Weekly List",
  },

  WEEKLY_EMPTY: {
    minimal: "No items this week.",
    gentle: "Nothing here right now. That’s okay.",
    snark_lite: "No items this week. Iconic.",
    spicy: "No items this week. Bold choice.",
    byBrain: {
      very_little: {
        minimal: "Empty.",
        gentle: "Empty is fine.",
        snark_lite: "Empty. Still counts.",
        spicy: "Empty. We love a minimalist era.",
      },
      some: {
        minimal: "No items yet.",
        gentle: "No items yet — keep it simple.",
        snark_lite: "No items yet. Low-power week.",
        spicy: "No items yet. Battery saver vibes.",
      },
    },
  },
};

// ---- helpers ----

function normalizeTone(prefs?: UIPrefsLike): Tone | "minimal" {
  if (prefs?.reduceChatter) return "minimal";
  return prefs?.tone ?? "snark_lite";
}

/**
 * Safe translation function.
 * - Never throws.
 * - If key is missing: returns a reasonable fallback (minimal generic).
 * - If tone-specific copy is missing: falls back to minimal.
 */
export function t(key: string, prefs?: UIPrefsLike, brain?: BrainCapacity): string {
  const tone = normalizeTone(prefs);
  const entry = COPY[key];

  // ✅ Hard guard: missing key should NEVER crash
  if (!entry) {
    // Don’t leak internal keys into UI unless you want that.
    // Return something calm and generic.
    return tone === "minimal" ? "Updated." : "Done.";
  }

  // brain override has highest priority (if provided)
  const brainOverride = brain ? entry.byBrain?.[brain]?.[tone] : undefined;
  if (typeof brainOverride === "string") return brainOverride;

  // tone-specific next
  if (tone !== "minimal") {
    const toneVal = (entry as any)[tone];
    if (typeof toneVal === "string") return toneVal;
  }

  // minimal fallback always exists in our type, but guard anyway
  if (typeof entry.minimal === "string") return entry.minimal;

  // absolute fallback (should never happen)
  return "Updated.";
}
