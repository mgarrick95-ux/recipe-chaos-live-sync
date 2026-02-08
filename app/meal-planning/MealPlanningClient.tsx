// app/meal-planning/MealPlanningClient.tsx
"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import RcPageShell from "@/components/rc/RcPageShell";
import { useUIPrefs } from "../../components/UIPrefsProvider";
import { t } from "@/lib/copy";

/* =========================
   Types
========================= */

type Recipe = {
  id: string;
  title: string;
  favorite?: boolean | null;
  tags?: any;
  ingredients?: any;
  steps?: any;
};

type SlotPlan = {
  slotId: string;
  mainId: string | null;
  sideId: string | null;
  sideHint?: string | null; // NEW: fallback suggestion when no side recipe fits
  locked: boolean;
  cooked: boolean;
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

type StorageItem = {
  id: string;
  name: string;
  location?: string;
  quantity?: any;
  unit?: string | null;
};

type Course = "main" | "side" | "breakfast" | "dessert" | "snack" | "unknown";

type Profile = {
  course: Course;
  cuisines: Set<string>;
  vibes: Set<string>;
  sweetness: number;
  heaviness: number;
  confidence: number;
  flags: {
    hasExplicitCourseTag: boolean;
    explicitCourse: Course | null;
    conflict: boolean;
    blockedForAutopick: boolean;
    blockedForSideAutopick: boolean;
  };
};

/* =========================
   Date helpers
========================= */

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

/* =========================
   Tiny utilities
========================= */

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

function normalizeName(input: string) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeStringArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    return s.includes("\n")
      ? s.split("\n").map((x) => x.trim()).filter(Boolean)
      : s.split(",").map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function makeEmptySlots(count: number): SlotPlan[] {
  const n = clampMealCount(count);
  return Array.from({ length: n }).map(() => ({
    slotId: uid(),
    mainId: null,
    sideId: null,
    sideHint: null,
    locked: false,
    cooked: false,
  }));
}

function coerceNumber(v: any, fallback = 0) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/* =========================
   Guardrail heuristics
========================= */

const KW = {
  dessert: ["cookie", "cookies", "cake", "brownie", "cupcake", "muffin", "pie", "tart", "ice cream", "pudding", "candy", "fudge", "chocolate", "cheesecake", "frosting", "icing", "donut", "doughnut", "sweet"],
  breakfast: ["waffle", "waffles", "pancake", "pancakes", "omelet", "omelette", "scramble", "scrambled", "french toast", "granola", "oatmeal", "cereal", "breakfast", "bagel", "yogurt", "parfait", "hashbrown", "hash browns"],
  side: ["side", "salad", "slaw", "fries", "chips", "salsa", "guacamole", "dip", "bread", "rolls", "garlic bread", "rice", "pilaf", "mashed", "roasted", "steamed", "sauteed", "carrots", "green beans", "asparagus", "broccoli", "cucumber", "coleslaw", "potato", "potatoes"],
  snack: ["snack", "appetizer", "starter", "bite", "bites"],
  soup: ["soup", "stew", "chowder", "bisque", "ramen", "pho", "chili"],
  sandwich: ["sandwich", "panini", "wrap", "taco", "quesadilla", "burger", "sub", "grilled cheese"],
  pasta: ["pasta", "spaghetti", "lasagna", "ravioli", "alfredo", "mac and cheese", "macaroni"],
  italian: ["italian", "parmesan", "marinara", "bolognese", "pesto", "lasagna", "risotto"],
  mexican: ["taco", "tacos", "burrito", "enchilada", "quesadilla", "salsa", "guac", "guacamole"],
  asian: ["stir fry", "stir-fry", "teriyaki", "soy", "miso", "ramen", "curry", "kimchi", "sesame"],
  seafood: ["salmon", "tuna", "shrimp", "cod", "tilapia", "crab", "lobster"],
  grill: ["grilled", "bbq", "barbecue", "smoked", "char"],
  salad: ["salad", "slaw"],
};

// Conservative “main-ish” blockers for side auto-pick
const MAINISH = {
  proteins: ["chicken", "beef", "pork", "turkey", "steak", "sausage", "ham", "salmon", "shrimp", "tuna", "cod", "tilapia"],
  entreeWords: ["parmesan", "meatloaf", "casserole", "lasagna", "alfredo", "bolognese", "stir fry", "stir-fry", "enchilada", "burger", "pizza", "chili"],
};

// Hard breakfast tokens (override tags)
const BREAKFAST_HARD = ["pancake", "pancakes", "waffle", "waffles", "french toast", "omelet", "omelette", "scramble", "scrambled", "oatmeal", "granola", "bagel"];

function titleTokens(recipe: Recipe) {
  const tt = normalizeName(recipe.title || "");
  return new Set(tt.split(" ").filter(Boolean));
}

function intersects(a: Set<string>, b: Set<string>) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

function resolveExplicitCourseFromTags(tagList: string[]): Course | null {
  const tags = new Set(tagList.map(normalizeName));
  const courseTags: Course[] = [];
  if (tags.has("main")) courseTags.push("main");
  if (tags.has("side")) courseTags.push("side");
  if (tags.has("breakfast")) courseTags.push("breakfast");
  if (tags.has("dessert")) courseTags.push("dessert");
  if (tags.has("snack")) courseTags.push("snack");

  if (courseTags.length === 1) return courseTags[0];
  if (courseTags.length > 1) return "unknown";
  return null;
}

function profileRecipe(recipe: Recipe): Profile {
  const title = normalizeName(recipe.title || "");
  const toks = titleTokens(recipe);
  const ing = safeStringArray(recipe.ingredients).map(normalizeName);
  const tagList = safeStringArray(recipe.tags).map(normalizeName);

  const text = [title, ...ing, ...tagList].join(" ");

  const has = (list: string[]) => list.some((k) => text.includes(k));

  // Heuristic detection
  const dessertHit = has(KW.dessert);
  const breakfastHit = has(KW.breakfast);
  const sideHit = has(KW.side);
  const snackHit = has(KW.snack);

  const sweetIngSignals = ["sugar", "brown sugar", "honey", "maple", "vanilla", "cocoa", "chocolate"];
  const sweetHits = sweetIngSignals.reduce((a, k) => a + (text.includes(k) ? 1 : 0), 0);

  let heuristicCourse: Course = "unknown";
  let heuristicConfidence = 0.35;

  if (dessertHit || sweetHits >= 2) {
    heuristicCourse = "dessert";
    heuristicConfidence = 0.9;
  } else if (breakfastHit) {
    heuristicCourse = "breakfast";
    heuristicConfidence = 0.87;
  } else if (snackHit) {
    heuristicCourse = "snack";
    heuristicConfidence = 0.75;
  } else if (sideHit) {
    heuristicCourse = "side";
    heuristicConfidence = 0.7;
  } else {
    heuristicCourse = "main";
    heuristicConfidence = 0.55;
  }

  // HARD: Breakfast override (pancakes should never become dessert because someone tagged it wrong)
  if (BREAKFAST_HARD.some((k) => title.includes(k) || text.includes(k))) {
    heuristicCourse = "breakfast";
    heuristicConfidence = Math.max(heuristicConfidence, 0.9);
  }

  // Extra hard signals
  if (title.includes("fries")) {
    heuristicCourse = "side";
    heuristicConfidence = 0.95;
  }
  if (title.includes("cookie")) {
    heuristicCourse = "dessert";
    heuristicConfidence = 0.95;
  }
  if (title.includes("grilled cheese")) {
    heuristicCourse = "main";
    heuristicConfidence = Math.max(heuristicConfidence, 0.8);
  }

  // Explicit tags
  const explicitCourse = resolveExplicitCourseFromTags(tagList);
  const hasExplicitCourseTag = explicitCourse !== null;

  // cuisines/vibes
  const cuisines = new Set<string>();
  const vibes = new Set<string>();

  if (has(KW.italian)) cuisines.add("italian");
  if (has(KW.mexican)) cuisines.add("mexican");
  if (has(KW.asian)) cuisines.add("asian");

  if (has(KW.soup)) vibes.add("soup");
  if (has(KW.sandwich)) vibes.add("sandwich");
  if (has(KW.pasta)) vibes.add("pasta");
  if (has(KW.salad)) vibes.add("salad");
  if (has(KW.seafood)) vibes.add("seafood");
  if (has(KW.grill)) vibes.add("grill");
  if (text.includes("fried") || title.includes("fries")) vibes.add("fried");

  const heavySignals = ["cream", "cheese", "butter", "fried", "lasagna", "alfredo", "casserole", "chili"];
  const lightSignals = ["salad", "cucumber", "vinaigrette", "broccoli", "steam", "grilled", "lemon", "herb"];

  const heavy = heavySignals.reduce((a, k) => a + (text.includes(k) ? 1 : 0), 0);
  const light = lightSignals.reduce((a, k) => a + (text.includes(k) ? 1 : 0), 0);

  const heaviness = Math.max(0, Math.min(1, (heavy - light + 2) / 6));
  const sweetness = Math.max(0, Math.min(1, (sweetHits + (dessertHit ? 2 : 0)) / 5));

  // Short-title dampener
  const shortBad = toks.size <= 2 && heuristicCourse === "main";
  if (shortBad) heuristicConfidence = Math.min(heuristicConfidence, 0.48);

  // Reconcile
  let course: Course = heuristicCourse;
  let confidence = heuristicConfidence;
  let conflict = false;
  let blockedForAutopick = false;

  if (hasExplicitCourseTag && explicitCourse) {
    if (explicitCourse === "unknown") {
      conflict = true;
      course = "unknown";
      confidence = Math.min(confidence, 0.4);
      blockedForAutopick = true;
    } else {
      // HARD breakfast still wins if explicit tag says dessert
      if (explicitCourse === "dessert" && heuristicCourse === "breakfast" && heuristicConfidence >= 0.85) {
        conflict = true;
        course = "breakfast";
        confidence = Math.max(confidence, 0.85);
      } else {
        course = explicitCourse;
      }
    }
  }

  if (course === "unknown") blockedForAutopick = true;

  // Block mains from being auto-picked as sides
  const proteinHit = MAINISH.proteins.some((k) => text.includes(k));
  const entreeHit = MAINISH.entreeWords.some((k) => text.includes(k));
  const mainShapedVibe = vibes.has("pasta") || vibes.has("sandwich") || vibes.has("soup");
  const clearlySidey =
    vibes.has("salad") ||
    title.includes("slaw") ||
    title.includes("coleslaw") ||
    title.includes("garlic bread") ||
    title.includes("roll") ||
    title.includes("dip") ||
    title.includes("salsa") ||
    title.includes("guacamole") ||
    title.includes("fries");

  const looksMainish = mainShapedVibe || proteinHit || entreeHit || (heuristicCourse === "main" && heuristicConfidence >= 0.6);
  const blockedForSideAutopick = course === "side" && looksMainish && !clearlySidey;

  return {
    course,
    cuisines,
    vibes,
    sweetness,
    heaviness,
    confidence,
    flags: {
      hasExplicitCourseTag,
      explicitCourse: explicitCourse ?? null,
      conflict,
      blockedForAutopick,
      blockedForSideAutopick,
    },
  };
}

/* =========================
   Smart fallback side suggestions (strings)
========================= */

function uniqueStrings(list: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const k = normalizeName(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function fallbackSideSuggestionsForMain(main: Profile): string[] {
  // If you don't have matching side recipes, we still give something sensible.
  // These are intentionally boring (boring sides are good sides).
  const base = ["Green salad", "Roasted broccoli", "Steamed green beans", "Rice", "Bread & butter"];

  // Cuisine-ish
  if (main.cuisines.has("italian") || main.vibes.has("pasta")) {
    return uniqueStrings([
      "Garlic bread",
      "Caesar salad",
      "Roasted broccoli",
      "Simple side salad",
      "Sautéed spinach",
      ...base,
    ]);
  }

  if (main.cuisines.has("mexican")) {
    return uniqueStrings([
      "Chips & salsa",
      "Mexican rice",
      "Refried beans",
      "Guacamole",
      "Simple cabbage slaw",
      ...base,
    ]);
  }

  if (main.cuisines.has("asian")) {
    return uniqueStrings([
      "Steamed rice",
      "Cucumber salad",
      "Stir-fried broccoli",
      "Edamame",
      "Simple slaw",
      ...base,
    ]);
  }

  // Vibe-ish
  if (main.vibes.has("soup") || main.vibes.has("chili")) {
    return uniqueStrings(["Garlic toast", "Grilled bread", "Simple side salad", "Crackers", ...base]);
  }

  if (main.course === "breakfast") {
    return uniqueStrings([
      "Fruit",
      "Toast",
      "Yogurt",
      "Bacon or sausage",
      "Hash browns",
      "Breakfast potatoes",
    ]);
  }

  if (main.heaviness >= 0.65) {
    return uniqueStrings(["Green salad", "Roasted vegetables", "Steamed broccoli", "Cucumber salad", ...base]);
  }

  return uniqueStrings(base);
}

/* =========================
   Side scoring
========================= */

function scoreSideForMain(
  main: Profile,
  side: Profile,
  alreadyUsedSideIds: Set<string>,
  sideId: string,
  usedSideVibes: { saladCount: number }
) {
  if (side.course !== "side") return -999;
  if (side.flags.blockedForSideAutopick) return -999;
  if (main.course === "dessert" || main.course === "snack") return -999;

  let score = 0;

  if (alreadyUsedSideIds.has(sideId)) score -= 3.25;

  if (main.cuisines.size > 0 && intersects(main.cuisines, side.cuisines)) score += 1.2;
  if (main.cuisines.size > 0 && side.cuisines.size === 0) score += 0.25;

  const mainIsSalady = main.vibes.has("salad");
  const sideIsSalady = side.vibes.has("salad");

  if (mainIsSalady && sideIsSalady) score -= 2.25;

  if (sideIsSalady && usedSideVibes.saladCount >= 1) score -= 1.25;
  if (sideIsSalady && usedSideVibes.saladCount >= 2) score -= 2.0;

  if (main.vibes.has("soup") && (side.vibes.has("sandwich") || sideIsSalady)) score += 1.0;

  if (main.vibes.has("pasta") || main.heaviness >= 0.6) {
    if (sideIsSalady) score += 0.9;
    if (side.heaviness <= 0.4) score += 0.55;
    if (side.heaviness >= 0.65) score -= 1.0;
  }

  // Breakfast: avoid dinner-y sides
  if (main.course === "breakfast") {
    if (side.vibes.has("pasta") || side.vibes.has("soup")) score -= 1.25;
    if (side.heaviness >= 0.65) score -= 1.1;
    if (side.vibes.has("fried")) score += 0.2; // hash browns, etc
    if (sideIsSalady) score -= 0.35;
  }

  score += intersects(main.vibes, side.vibes) ? 0.05 : 0.25;
  score += (side.confidence - 0.5) * 0.6;

  return score;
}

/* =========================
   Ingredient parsing (rough)
========================= */

function extractIngredientNames(recipe: Recipe): string[] {
  const lines = safeStringArray(recipe.ingredients);
  const out: string[] = [];

  for (const raw of lines) {
    const s = normalizeName(raw)
      .replace(/\b\d+([\/.]\d+)?\b/g, " ")
      .replace(
        /\b(cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|oz|ounce|ounces|lb|lbs|pound|pounds|gram|grams|kg|ml|l|liter|liters)\b/g,
        " "
      )
      .replace(/\b(small|medium|large|fresh|dried|minced|chopped|sliced|diced|crushed|ground)\b/g, " ")
      .replace(/\(.*?\)/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!s) continue;

    const parts = s.split(" ").filter(Boolean);
    const core = parts.slice(0, Math.min(3, parts.length)).join(" ").trim();
    if (!core) continue;

    if (core === "to taste" || core === "optional") continue;

    out.push(core);
  }

  return Array.from(new Set(out)).filter(Boolean);
}

function buildNeededIngredients(recipesById: Map<string, Recipe>, plan: SlotPlan[]) {
  const counts = new Map<string, number>();

  for (const slot of plan) {
    const ids = [slot.mainId, slot.sideId].filter(Boolean) as string[];
    for (const id of ids) {
      const r = recipesById.get(id);
      if (!r) continue;
      const ings = extractIngredientNames(r);
      for (const ing of ings) {
        const key = normalizeName(ing);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }

  return counts;
}

function matchStorageToIngredient(storage: StorageItem[], ingKey: string) {
  const k = normalizeName(ingKey);
  const exact = storage.find((it) => normalizeName(it.name) === k);
  if (exact) return exact;

  const contains = storage.find((it) => normalizeName(it.name).includes(k) || k.includes(normalizeName(it.name)));
  return contains || null;
}

/* =========================
   Component
========================= */

export default function MealPlanningClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { prefs, brainCapacity } = useUIPrefs();
  const prefsForCopy = prefs as any;

  useEffect(() => {
    fetch("/api/recipes/auto-tag", { method: "POST" }).catch(() => {});
  }, []);

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

  const [storageItems, setStorageItems] = useState<StorageItem[]>([]);
  const [loadingStorage, setLoadingStorage] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);

  const [mealCount, setMealCount] = useState<number>(7);
  const [slots, setSlots] = useState<SlotPlan[]>(makeEmptySlots(7));
  const [status, setStatus] = useState<string>("");

  const [planId, setPlanId] = useState<string | null>(null);
  const [planBusy, setPlanBusy] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const profilesById = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const r of recipes) m.set(r.id, profileRecipe(r));
    return m;
  }, [recipes]);

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

  async function loadStorage() {
    try {
      setLoadingStorage(true);
      setStorageError(null);

      const res = await fetch("/api/storage-items", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Failed to load pantry");

      setStorageItems((json?.items ?? []) as StorageItem[]);
    } catch (e: any) {
      setStorageItems([]);
      setStorageError(e?.message || "Failed to load pantry");
    } finally {
      setLoadingStorage(false);
    }
  }

  useEffect(() => {
    loadStorage();
  }, []);

  async function loadPlan() {
    setPlanBusy(true);
    setStatus("");

    try {
      const res = await fetch("/api/meal-plans", { cache: "no-store" });
      const json: PlanResponse = await res.json().catch(() => ({ ok: false } as any));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load meal plan");

      const p = json.plan!;
      setPlanId((p.id as any) ?? null);

      const raw = p.selected_recipe_ids;

      if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "object") {
        const incoming = raw as any[];
        const nextSlots: SlotPlan[] = incoming.map((x) => ({
          slotId: String(x.slotId ?? uid()),
          mainId: x.mainId ?? x.recipeId ?? null,
          sideId: x.sideId ?? null,
          sideHint: x.sideHint ?? null,
          locked: Boolean(x.locked),
          cooked: Boolean(x.cooked),
        }));

        setMealCount(nextSlots.length);
        setSlots(nextSlots);
      } else if (Array.isArray(raw)) {
        const ids = raw.filter(Boolean).map(String);
        const nextSlots = makeEmptySlots(Math.max(mealCount, ids.length || 7));
        for (let i = 0; i < nextSlots.length; i++) {
          nextSlots[i].mainId = ids[i] ?? null;
        }
        setMealCount(nextSlots.length);
        setSlots(nextSlots);
      } else {
        setMealCount(p.meal_count ?? 7);
        setSlots(makeEmptySlots(p.meal_count ?? 7));
      }
    } catch (e: any) {
      setStatus(e?.message || "Failed to load plan");
    } finally {
      setPlanBusy(false);
    }
  }

  useEffect(() => {
    loadPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function savePlan(nextSlots: SlotPlan[]) {
    setSaving(true);
    setStatus("");

    try {
      const payload = {
        selected_recipe_ids: nextSlots.map((s) => ({
          slotId: s.slotId,
          mainId: s.mainId,
          sideId: s.sideId,
          sideHint: s.sideHint ?? null,
          locked: s.locked,
          cooked: s.cooked,
        })),
      };

      const res = await fetch("/api/meal-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json: PlanResponse = await res.json().catch(() => ({ ok: false } as any));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to save meal plan");

      setPlanId((json.plan?.id as any) ?? planId);
      setStatus("Saved");
    } catch (e: any) {
      setStatus(e?.message || "Save failed");
    } finally {
      setSaving(false);
      setTimeout(() => setStatus((s) => (s === "Saved" ? "" : s)), 1200);
    }
  }

  /* =========================
     Candidates
  ========================= */

  const mainCandidates = useMemo(() => {
    const ids: string[] = [];
    for (const r of recipes) {
      const p = profilesById.get(r.id);
      if (!p) continue;
      if (p.flags.blockedForAutopick) continue;
      if (p.course === "main" || p.course === "breakfast") {
        if (p.confidence >= 0.52) ids.push(r.id);
      }
    }
    return ids;
  }, [recipes, profilesById]);

  const sideCandidates = useMemo(() => {
    const ids: string[] = [];
    for (const r of recipes) {
      const p = profilesById.get(r.id);
      if (!p) continue;
      if (p.flags.blockedForAutopick) continue;
      if (p.flags.blockedForSideAutopick) continue;
      if (p.course === "side") {
        if (p.confidence >= 0.6) ids.push(r.id);
      }
    }
    return ids;
  }, [recipes, profilesById]);

  function pickSideForMain(mainId: string, usedSideIds: Set<string>, usedSideVibes: { saladCount: number }) {
    const mainP = profilesById.get(mainId);
    if (!mainP) return { sideId: null as string | null, sideHint: null as string | null };

    let best: { id: string; score: number } | null = null;

    for (const sid of sideCandidates) {
      const sideP = profilesById.get(sid);
      if (!sideP) continue;

      const sc = scoreSideForMain(mainP, sideP, usedSideIds, sid, usedSideVibes);
      if (best == null || sc > best.score) best = { id: sid, score: sc };
    }

    // Prefer a real side recipe if it’s decent
    if (best && best.score >= 0.25) {
      return { sideId: best.id, sideHint: null };
    }

    // Otherwise: a smart fallback suggestion string
    const fallbacks = fallbackSideSuggestionsForMain(mainP);
    return { sideId: null, sideHint: fallbacks[0] ?? null };
  }

  function recomputeSides(nextSlots: SlotPlan[]) {
    const used = new Set<string>();
    const usedSideVibes = { saladCount: 0 };

    const updated = nextSlots.map((s) => {
      if (!s.mainId) return { ...s, sideId: null, sideHint: null };

      // If we already have a real side and it's still eligible, keep it.
      if (s.sideId) {
        const sideP = profilesById.get(s.sideId);
        const mainP = profilesById.get(s.mainId);
        if (sideP?.course === "side" && mainP && !sideP.flags.blockedForSideAutopick) {
          const sc = scoreSideForMain(mainP, sideP, used, s.sideId, usedSideVibes);
          if (sc >= 0.25) {
            used.add(s.sideId);
            if (sideP.vibes.has("salad")) usedSideVibes.saladCount += 1;
            return { ...s, sideHint: null };
          }
        }
      }

      const picked = pickSideForMain(s.mainId, used, usedSideVibes);
      if (picked.sideId) {
        used.add(picked.sideId);
        const p = profilesById.get(picked.sideId);
        if (p?.vibes.has("salad")) usedSideVibes.saladCount += 1;
      }

      return { ...s, sideId: picked.sideId, sideHint: picked.sideHint };
    });

    return updated;
  }

  async function doItForMe() {
    if (recipes.length === 0) return;

    const candidates = shuffle(mainCandidates);
    const usedMain = new Set<string>(slots.map((s) => s.mainId).filter(Boolean) as string[]);

    const next = slots.map((s) => {
      if (s.locked) return s;
      return { ...s, mainId: null, sideId: null, sideHint: null, cooked: false };
    });

    let idx = 0;
    for (let i = 0; i < next.length; i++) {
      if (next[i].locked) continue;

      while (idx < candidates.length && usedMain.has(candidates[idx])) idx++;
      if (idx >= candidates.length) break;

      const id = candidates[idx++];
      next[i].mainId = id;
      usedMain.add(id);
    }

    const withSides = recomputeSides(next);
    setSlots(withSides);
    await savePlan(withSides);
  }

  async function regenerateUnlocked() {
    if (recipes.length === 0) return;

    const candidates = shuffle(mainCandidates);
    const lockedMain = new Set<string>(
      slots.filter((s) => s.locked && s.mainId).map((s) => s.mainId!) as string[]
    );

    const next = slots.map((s) => {
      if (s.locked) return s;
      return { ...s, mainId: null, sideId: null, sideHint: null, cooked: false };
    });

    let idx = 0;
    for (let i = 0; i < next.length; i++) {
      if (next[i].locked) continue;

      while (idx < candidates.length && lockedMain.has(candidates[idx])) idx++;
      if (idx >= candidates.length) break;

      next[i].mainId = candidates[idx++];
    }

    const withSides = recomputeSides(next);
    setSlots(withSides);
    await savePlan(withSides);
  }

  async function swapSide(slotId: string) {
    const next = (() => {
      const used = new Set<string>(slots.map((s) => s.sideId).filter(Boolean) as string[]);
      const usedSideVibes = { saladCount: 0 };

      for (const s of slots) {
        if (s.slotId === slotId) continue;
        if (!s.sideId) continue;
        const p = profilesById.get(s.sideId);
        if (p?.vibes.has("salad")) usedSideVibes.saladCount += 1;
      }

      return slots.map((s) => {
        if (s.slotId !== slotId) return s;
        if (!s.mainId) return s;

        const mainP = profilesById.get(s.mainId);
        if (!mainP) return s;

        // If we currently have a fallback hint (no real side), cycle hint list.
        if (!s.sideId) {
          const list = fallbackSideSuggestionsForMain(mainP);
          const cur = normalizeName(s.sideHint ?? "");
          const idx = Math.max(
            0,
            list.findIndex((x) => normalizeName(x) === cur)
          );
          const nextHint = list.length > 0 ? list[(idx + 1) % list.length] : null;
          return { ...s, sideHint: nextHint };
        }

        // Else: cycle through real side recipes
        if (s.sideId) used.delete(s.sideId);

        let best: { id: string; score: number } | null = null;
        for (const sid of sideCandidates) {
          if (sid === s.sideId) continue;
          const sideP = profilesById.get(sid);
          if (!sideP) continue;

          const sc = scoreSideForMain(mainP, sideP, used, sid, usedSideVibes);
          if (best == null || sc > best.score) best = { id: sid, score: sc };
        }

        const nextSide = best && best.score >= 0.25 ? best.id : null;

        if (nextSide) return { ...s, sideId: nextSide, sideHint: null };

        // no good side recipe? fall back to hint
        const fallbacks = fallbackSideSuggestionsForMain(mainP);
        return { ...s, sideId: null, sideHint: fallbacks[0] ?? null };
      });
    })();

    setSlots(next);
    await savePlan(next);
  }

  /* =========================
     Pantry projection + shopping list build
========================= */

  const neededCounts = useMemo(() => {
    if (recipes.length === 0) return new Map<string, number>();
    return buildNeededIngredients(recipesById, slots.filter((s) => !!s.mainId));
  }, [recipes, recipesById, slots]);

  const pantryProjection = useMemo(() => {
    const usage: { key: string; display: string; needed: number; have: number; matchedName?: string }[] = [];
    const missing: { key: string; display: string; needed: number; have: number; matchedName?: string }[] = [];

    const storage = storageItems || [];

    for (const [key, needed] of neededCounts.entries()) {
      const match = matchStorageToIngredient(storage, key);
      const have = match ? coerceNumber(match.quantity, 0) : 0;

      const row = { key, display: key, needed, have, matchedName: match?.name };

      usage.push(row);
      if (have < needed) missing.push(row);
    }

    usage.sort((a, b) => b.needed - a.needed);
    missing.sort((a, b) => b.needed - b.have - (a.needed - a.have));

    return { usage, missing };
  }, [neededCounts, storageItems]);

  async function addMissingToShoppingList() {
    const miss = pantryProjection.missing;
    if (miss.length === 0) {
      setStatus("Nothing missing 🎉");
      setTimeout(() => setStatus(""), 1200);
      return;
    }

    setStatus("Adding…");
    try {
      for (const m of miss.slice(0, 60)) {
        const qty = Math.max(1, m.needed - m.have);
        const name = m.matchedName || m.display;

        await fetch("/api/shopping-list/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, quantity: qty }),
        });
      }

      setStatus("Shopping list updated");
      setTimeout(() => setStatus(""), 1200);
    } catch (e: any) {
      setStatus(e?.message || "Failed to update shopping list");
    }
  }

  async function markCooked(slotId: string) {
    const slot = slots.find((s) => s.slotId === slotId);
    if (!slot || !slot.mainId) return;

    const ids = [slot.mainId, slot.sideId].filter(Boolean) as string[];
    const storage = storageItems || [];

    const ingredientKeys: string[] = [];
    for (const id of ids) {
      const r = recipesById.get(id);
      if (!r) continue;
      ingredientKeys.push(...extractIngredientNames(r).map(normalizeName));
    }

    try {
      for (const key of ingredientKeys) {
        const match = matchStorageToIngredient(storage, key);
        if (!match) continue;

        const have = coerceNumber(match.quantity, 0);
        const nextQty = Math.max(0, have - 1);
        if (nextQty === have) continue;

        await fetch(`/api/storage-items/${match.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: nextQty }),
        });
      }
    } catch {
      // don't block cooked if pantry update fails
    }

    const next = slots.map((s) => (s.slotId === slotId ? { ...s, cooked: true } : s));
    setSlots(next);
    await savePlan(next);
    await loadStorage();
  }

  /* =========================
     UI
========================= */

  const header = (
    <div className="mt-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-4xl font-extrabold">{pageTitle}</h1>
          <div className="text-sm opacity-70">
            Week: {weekStartStr} → {weekEndStr}
            {status ? ` • ${status}` : ""}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => goToWeek(addDays(weekStart, -7))}
            className="rounded-full bg-white/6 hover:bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/10 transition"
            title="Previous week"
          >
            ←
          </button>

          <button
            type="button"
            onClick={() => goToWeek(addDays(weekStart, +7))}
            className="rounded-full bg-white/6 hover:bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/10 transition"
            title="Next week"
          >
            →
          </button>

          <button
            type="button"
            onClick={doItForMe}
            disabled={loadingRecipes || recipes.length === 0 || saving || planBusy}
            className="rounded-full bg-emerald-400/80 hover:bg-emerald-400 px-5 py-3 text-sm font-extrabold text-black disabled:opacity-50 ring-1 ring-white/10 transition shadow-lg shadow-emerald-400/10"
          >
            {saving || planBusy ? "Working…" : "Do it for me"}
          </button>

          <button
            type="button"
            onClick={regenerateUnlocked}
            disabled={loadingRecipes || recipes.length === 0 || saving || planBusy}
            className="rounded-full bg-white/10 hover:bg-white/15 px-5 py-3 text-sm font-semibold ring-1 ring-white/10 transition disabled:opacity-50"
            title="Keep locked meals; regenerate the rest"
          >
            Regenerate (unlocked)
          </button>

          <button
            type="button"
            onClick={addMissingToShoppingList}
            disabled={loadingStorage || pantryProjection.missing.length === 0}
            className="rounded-full bg-white/10 hover:bg-white/15 px-5 py-3 text-sm font-semibold ring-1 ring-white/10 transition disabled:opacity-50"
            title="Add missing ingredients to shopping list"
          >
            Add → Shopping list
          </button>
        </div>
      </div>
    </div>
  );

  const box = "rounded-3xl bg-white/5 ring-1 ring-white/10";
  const pill =
    "rounded-full bg-white/8 hover:bg-white/12 px-4 py-2 text-xs font-semibold ring-1 ring-white/10 transition";
  const pillActive =
    "rounded-full bg-emerald-400/25 hover:bg-emerald-400/30 px-4 py-2 text-xs font-extrabold ring-1 ring-white/10 transition";
  const tinyBtn =
    "rounded-full bg-white/8 hover:bg-white/12 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/10 transition";
  const tinyBtn2 =
    "rounded-full bg-white/10 hover:bg-white/15 px-4 py-2 text-xs font-semibold ring-1 ring-white/10 transition";

  return (
    <RcPageShell header={header}>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className={[box, "p-5 text-white"].join(" ")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold tracking-tight">Pantry projection</div>
              <div className="mt-1 text-sm text-white/60">
                Based on your plan (mains + suggested sides). Approximate, but helpful.
              </div>
            </div>
            <button type="button" onClick={loadStorage} className={tinyBtn} disabled={loadingStorage}>
              {loadingStorage ? "Refreshing…" : "Refresh pantry"}
            </button>
          </div>

          {storageError ? (
            <div className="mt-4 text-sm text-red-300">{storageError}</div>
          ) : (
            <>
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <span className={pillActive}>Missing: {pantryProjection.missing.length}</span>
                <span className={pill}>Tracked pantry items: {storageItems.length}</span>
                <span className={pill}>Ingredients in plan: {pantryProjection.usage.length}</span>
              </div>

              {pantryProjection.missing.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {pantryProjection.missing.slice(0, 8).map((m) => (
                    <div key={m.key} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-semibold text-white/85 truncate">{m.matchedName || m.display}</div>
                        <div className="text-xs text-white/55">
                          need {m.needed} • have {m.have}
                        </div>
                      </div>
                      <div className="text-xs text-white/55 shrink-0">+{Math.max(1, m.needed - m.have)}</div>
                    </div>
                  ))}

                  {pantryProjection.missing.length > 8 ? (
                    <div className="text-xs text-white/45 mt-2">…and {pantryProjection.missing.length - 8} more</div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 text-sm text-white/70">
                  No obvious gaps. (Either you’re stocked, or the pantry isn’t fully tracked yet.)
                </div>
              )}
            </>
          )}
        </div>

        <div className={[box, "p-5 text-white"].join(" ")}>
          <div className="text-lg font-extrabold tracking-tight">Smart guardrails</div>
          <div className="mt-2 text-sm text-white/65 space-y-2">
            <div>• Pancakes/waffles/etc are treated as breakfast (even if tagged wrong).</div>
            <div>• Main-shaped recipes won’t be auto-picked as sides.</div>
            <div>• If no good side recipe exists, you still get a smart suggestion.</div>
            <div className="text-white/45">Manual choices are always allowed.</div>
          </div>
        </div>

        <div className={[box, "p-5 text-white"].join(" ")}>
          <div className="text-lg font-extrabold tracking-tight">Controls</div>
          <div className="mt-3 grid gap-3">
            <button
              type="button"
              onClick={async () => {
                const next = makeEmptySlots(mealCount);
                setSlots(next);
                await savePlan(next);
              }}
              className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3 font-semibold ring-1 ring-white/10 transition"
            >
              Clear plan
            </button>

            <button
              type="button"
              onClick={async () => {
                const next = recomputeSides([...slots]);
                setSlots(next);
                await savePlan(next);
              }}
              className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3 font-semibold ring-1 ring-white/10 transition"
            >
              Re-pick sides
            </button>

            <div className="text-xs text-white/45">
              Tip: Lock the ones you want. Then spam “Regenerate (unlocked)” until the chaos behaves.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        {loadingRecipes ? (
          <div className="text-white/70">Loading…</div>
        ) : recipesError ? (
          <div className="text-red-400">{recipesError}</div>
        ) : (
          <div className="grid gap-4">
            {slots.map((slot, idx) => {
              const main = slot.mainId ? recipesById.get(slot.mainId) : null;
              const side = slot.sideId ? recipesById.get(slot.sideId) : null;

              const mainP = slot.mainId ? profilesById.get(slot.mainId) : null;

              const uncertainMain =
                !!mainP &&
                (mainP.course === "unknown" ||
                  mainP.flags.conflict ||
                  (mainP.confidence < 0.5 && titleTokens((main ?? { id: "", title: "" }) as any).size <= 2));

              return (
                <div key={slot.slotId} className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="font-extrabold text-white">Meal {idx + 1}</div>

                      {slot.locked ? (
                        <span className="rounded-full bg-emerald-400/25 px-3 py-1 text-xs font-extrabold text-white ring-1 ring-white/10">
                          Locked
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-white/75 ring-1 ring-white/10">
                          Unlocked
                        </span>
                      )}

                      {slot.cooked ? (
                        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 ring-1 ring-white/10">
                          Cooked
                        </span>
                      ) : null}

                      {uncertainMain ? (
                        <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-extrabold text-white ring-1 ring-white/10">
                          Not sure what this is 🤨
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={async () => {
                          const next = slots.map((s) =>
                            s.slotId === slot.slotId ? { ...s, locked: !s.locked } : s
                          );
                          setSlots(next);
                          await savePlan(next);
                        }}
                        className={tinyBtn2}
                      >
                        {slot.locked ? "Unlock" : "Lock"}
                      </button>

                      <button
                        type="button"
                        onClick={() => swapSide(slot.slotId)}
                        disabled={!slot.mainId}
                        className={tinyBtn2 + " disabled:opacity-50"}
                        title="Swap the side suggestion"
                      >
                        Swap side
                      </button>

                      <button
                        type="button"
                        onClick={() => markCooked(slot.slotId)}
                        disabled={!slot.mainId || slot.cooked}
                        className="rounded-full bg-emerald-400/20 hover:bg-emerald-400/25 px-4 py-2 text-xs font-extrabold ring-1 ring-white/10 transition disabled:opacity-50"
                        title="Mark cooked (and try to decrement pantry)"
                      >
                        {slot.cooked ? "Cooked ✓" : "Mark cooked"}
                      </button>

                      {main ? (
                        <Link href={`/recipes/${main.id}`} className="text-xs underline text-white/80">
                          View main
                        </Link>
                      ) : null}

                      {side ? (
                        <Link href={`/recipes/${side.id}`} className="text-xs underline text-white/65">
                          View side
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <select
                    value={slot.mainId ?? ""}
                    onChange={async (e) => {
                      const value = e.target.value || null;
                      const next = slots.map((s) =>
                        s.slotId === slot.slotId ? { ...s, mainId: value, cooked: false, sideId: null, sideHint: null } : s
                      );

                      const withSides = recomputeSides(next);
                      setSlots(withSides);
                      await savePlan(withSides);
                    }}
                    className="mt-3 w-full rounded-2xl bg-black/20 p-3 text-white ring-1 ring-white/10"
                  >
                    <option value="">— none —</option>

                    <optgroup label="Good mains (auto-picked)">
                      {recipes
                        .filter((r) => {
                          const p = profilesById.get(r.id);
                          if (!p) return false;
                          if (p.flags.blockedForAutopick) return false;
                          return p.course === "main" || p.course === "breakfast";
                        })
                        .map((rec) => (
                          <option key={rec.id} value={rec.id}>
                            {rec.favorite ? "★ " : ""}
                            {rec.title}
                          </option>
                        ))}
                    </optgroup>

                    <optgroup label="Everything else (allowed, but not auto-picked)">
                      {recipes
                        .filter((r) => {
                          const p = profilesById.get(r.id);
                          if (!p) return true;
                          return p.flags.blockedForAutopick || !(p.course === "main" || p.course === "breakfast");
                        })
                        .map((rec) => (
                          <option key={rec.id} value={rec.id}>
                            {rec.favorite ? "★ " : ""}
                            {rec.title}
                          </option>
                        ))}
                    </optgroup>
                  </select>

                  <div className="mt-3 text-sm text-white/75">
                    <span className="text-white/55">Side suggestion:</span>{" "}
                    {slot.mainId ? (
                      slot.sideId && side ? (
                        <Link href={`/recipes/${side.id}`} className="underline">
                          {side.title}
                        </Link>
                      ) : slot.sideHint ? (
                        <span className="text-white/70">
                          {slot.sideHint} <span className="text-white/40">(suggested)</span>
                        </span>
                      ) : (
                        <span className="text-white/50">— none —</span>
                      )
                    ) : (
                      <span className="text-white/50">Pick a main first</span>
                    )}
                  </div>

                  {slot.mainId && mainP ? (
                    <div className="mt-2 text-xs text-white/45">
                      Classified as{" "}
                      <span className="text-white/65 font-semibold">
                        {mainP.course === "breakfast" ? "breakfast/main" : mainP.course}
                      </span>
                      {mainP.flags.conflict ? <span className="text-white/45"> • (tags conflicted)</span> : null}
                      {mainP.vibes.size > 0 ? (
                        <>
                          {" "}
                          • vibe: <span className="text-white/55">{Array.from(mainP.vibes).slice(0, 3).join(", ")}</span>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </RcPageShell>
  );
}
