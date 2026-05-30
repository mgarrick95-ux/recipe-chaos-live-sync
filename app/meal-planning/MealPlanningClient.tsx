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
  ingredients?: any; // usually string[]
  steps?: any;

  ai_profile?: any; // jsonb
  user_profile?: any; // jsonb
};

type SlotPlan = {
  slotId: string;
  mainId: string | null;
  sideId: string | null;
  suggestedSideId: string | null;
  manualSideName: string | null;
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

type MealFamily =
  | "unknown"
  | "breakfast"
  | "sandwich_burger"
  | "mexican_handheld"
  | "italian_pasta"
  | "italian_main"
  | "soup_stew_chili"
  | "seafood_main"
  | "comfort_main"
  | "salad_main"
  | "generic_main";


type Profile = {
  course: Course;
  family: MealFamily;
  cuisines: Set<string>;
  vibes: Set<string>;
  sweetness: number; // 0..1
  heaviness: number; // 0..1
  confidence: number; // 0..1
};

type AICourse =
  | "main"
  | "side"
  | "breakfast"
  | "dessert"
  | "snack"
  | "sauce"
  | "component"
  | "drink"
  | "unknown";

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
  const day = d.getDay(); // 0=Sun..6=Sat
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
    suggestedSideId: null,
    manualSideName: null,
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
   Course helpers (AI/user)
========================= */

function readProfileCourseForUI(recipe: Recipe): { course: AICourse | null; source: "user" | "ai" | "none" } {
  const userCourse = (recipe as any)?.user_profile?.course;
  if (typeof userCourse === "string" && userCourse) return { course: userCourse as AICourse, source: "user" };

  const aiCourse = (recipe as any)?.ai_profile?.course;
  if (typeof aiCourse === "string" && aiCourse) return { course: aiCourse as AICourse, source: "ai" };

  return { course: null, source: "none" };
}

// Effective course for behavior: user → ai → heuristic → null
function effectiveCourseForPick(recipe: Recipe, fallbackHeuristic?: Course): AICourse | Course | null {
  const userCourse = (recipe as any)?.user_profile?.course;
  if (typeof userCourse === "string") {
    const clean = userCourse.toLowerCase().trim() as any;
    if (clean && clean !== "unknown") return clean;
  }

  const aiCourse = (recipe as any)?.ai_profile?.course;
  if (typeof aiCourse === "string") {
    const clean = aiCourse.toLowerCase().trim() as any;
    if (clean && clean !== "unknown") return clean;
  }

  if (typeof fallbackHeuristic === "string") {
    const clean = fallbackHeuristic.toLowerCase().trim() as any;
    if (clean) return clean;
  }

  return null;
}

function isNonMealCourse(c: any) {
  return c === "sauce" || c === "component" || c === "drink";
}

function isMealMainCourse(c: any) {
  return c === "main" || c === "breakfast";
}

/* =========================
   Heuristic profiler (local)
========================= */

const KW = {
  dessert: [
    "cookie","cookies","cake","brownie","cupcake","muffin","pie","tart","ice cream","pudding","candy","fudge",
    "chocolate","cheesecake","frosting","icing","donut","doughnut","sweet",
    "bar","bars","lemon bar","lemon bars",
  ],
  breakfast: [
    "waffle","waffles","pancake","pancakes","omelet","omelette","scramble","scrambled","french toast","granola",
    "oatmeal","cereal","breakfast","bagel","hashbrown","hash browns",
  ],
  side: [
    "side","salad","slaw","fries","chips","bread","rolls","garlic bread","rice","pilaf","mashed","roasted","steamed",
    "sauteed","carrots","green beans","asparagus","broccoli","cucumber","coleslaw","cornbread","breadsticks","toast",
    "noodles","vegetables","veggies","beans",
  ],
  snack: ["snack","appetizer","starter","bite","bites","fruit"],
  soup: ["soup","stew","chowder","bisque","ramen","pho","chili"],
  sandwich: ["sandwich","panini","wrap","burger","sub","grilled cheese"],
  pasta: ["pasta","spaghetti","lasagna","ravioli","alfredo","mac and cheese","macaroni"],
  italian: ["italian","parmesan","marinara","bolognese","pesto","lasagna","risotto","caesar","breadsticks","garlic bread","chicken parmesan","chicken parm"],
  mexican: ["taco","tacos","burrito","enchilada","quesadilla","salsa","guac","guacamole"],
  asian: ["stir fry","stir-fry","teriyaki","soy","miso","ramen","curry","kimchi","sesame","spring roll","spring rolls","egg roll","egg rolls"],
  seafood: ["salmon","tuna","shrimp","cod","tilapia","crab","lobster"],
  grill: ["grilled","bbq","barbecue","smoked","char"],
  salad: ["salad","slaw"],
};

const HARD_MAIN_SIGNALS = [
  "taco","tacos","burrito","enchilada","burger","sandwich","wrap","quesadilla","sub","panini","grilled cheese",
  "chili","stew","lasagna","spaghetti","pasta","meatloaf","casserole","fajita","fajitas",
  "mac and cheese","mac n cheese","chicken parmesan","chicken parm","parmesan",
  "bbq salad","barbecue salad","taco salad","cobb salad","chef salad",
];

// "likely side" keywords (even if AI didn't label it side yet)
const LIKELY_SIDE_KEYWORDS = [
  "salad","slaw","fries","chips","rice","pilaf","mashed","potatoes","roasted","steamed","sauteed","carrots",
  "green beans","asparagus","broccoli","cucumber","corn","cornbread","bread","rolls","garlic bread","toast",
  "noodles","vegetables","veggies","beans",
];

// explicit "not a side" keywords (hard-block even if mistakenly tagged side)
const NOT_SIDE_KEYWORDS = [
  "butter","mayo","mayonnaise","dressing","vinaigrette","aioli","sauce","marinara","alfredo","pesto","gravy",
  "ketchup","mustard","relish","seasoning","rub","spice mix","brine","marinade",
];

const BREAKFAST_SIDE_KEYWORDS = [
  "fruit","yogurt","toast","bagel","hashbrown","hash browns","bacon","sausage",
];

function titleTokens(recipe: Recipe) {
  const tt = normalizeName(recipe.title || "");
  return new Set(tt.split(" ").filter(Boolean));
}

function profileRecipe(recipe: Recipe): Profile {
  const title = normalizeName(recipe.title || "");
  const toks = titleTokens(recipe);
  const ing = safeStringArray(recipe.ingredients).map(normalizeName);
  const tagList = safeStringArray(recipe.tags).map(normalizeName);

  const hasTitle = (list: string[]) => list.some((k) => title.includes(k));
  const hasTag = (list: string[]) => list.some((k) => tagList.some((t) => t.includes(k)));
  const hasIngredient = (list: string[]) => list.some((k) => ing.some((i) => i.includes(k)));

  let course: Course = "unknown";
  let family: MealFamily = "unknown";
  let confidence = 0.35;

  const dessertHit = hasTitle(KW.dessert) || hasTag(KW.dessert);
  const breakfastHit = hasTitle(KW.breakfast) || hasTag(KW.breakfast);
  const snackHit = hasTitle(KW.snack) || hasTag(KW.snack);
  const sideHit = hasTitle(KW.side) || hasTag(KW.side);
  const mainHit = HARD_MAIN_SIGNALS.some((k) => title.includes(k));

  const sweetIngSignals = ["sugar","brown sugar","honey","maple","vanilla","cocoa","chocolate"];
  const sweetHits = sweetIngSignals.reduce((a, k) => a + (ing.some((i) => i.includes(k)) ? 1 : 0), 0);

  if (dessertHit || sweetHits >= 2) {
    course = "dessert";
    confidence = 0.9;
  } else if (breakfastHit) {
    course = "breakfast";
    family = "breakfast";
    confidence = 0.9;
  } else if (snackHit) {
    course = "snack";
    confidence = 0.75;
  } else if (mainHit) {
    course = "main";
    confidence = 0.92;
  } else if (sideHit) {
    course = "side";
    confidence = 0.72;
  } else {
    course = "main";
    confidence = 0.62;
  }

  if (course === "main" || course === "breakfast") {
    if (breakfastHit || title.includes("pancake") || title.includes("waffle") || title.includes("eggs")) {
      family = "breakfast";
    } else if (title.includes("soup") || title.includes("stew") || title.includes("chowder") || title.includes("bisque") || title.includes("chili")) {
      family = "soup_stew_chili";
    } else if (title.includes("burger") || title.includes("sandwich") || title.includes("panini") || title.includes("sub") || title.includes("grilled cheese") || title.includes("wrap")) {
      family = "sandwich_burger";
    } else if (title.includes("taco") || title.includes("tacos") || title.includes("burrito") || title.includes("enchil") || title.includes("quesadilla") || title.includes("fajita")) {
      family = "mexican_handheld";
    } else if (title.includes("spaghetti") || title.includes("lasagna") || title.includes("ravioli") || title.includes("alfredo") || title.includes("mac and cheese") || title.includes("macaroni") || title.includes("pasta")) {
      family = "italian_pasta";
    } else if (title.includes("parmesan") || title.includes("marinara") || title.includes("bolognese") || title.includes("pesto") || title.includes("risotto")) {
      family = "italian_main";
    } else if (title.includes("salmon") || title.includes("tuna") || title.includes("shrimp") || title.includes("cod") || title.includes("tilapia") || title.includes("crab") || title.includes("lobster")) {
      family = "seafood_main";
    } else if (title.includes("salad")) {
      family = "salad_main";
    } else if (title.includes("meatloaf") || title.includes("casserole") || title.includes("cabbage roll") || title.includes("unstuffed cabbage")) {
      family = "comfort_main";
    } else {
      family = "generic_main";
    }
  }

  const cuisines = new Set<string>();
  const vibes = new Set<string>();

  if (family === "italian_pasta" || family === "italian_main" || hasTitle(KW.italian) || hasTag(KW.italian)) cuisines.add("italian");
  if (family === "mexican_handheld" || hasTitle(KW.mexican) || hasTag(KW.mexican)) cuisines.add("mexican");
  if (hasTitle(KW.asian) || hasTag(KW.asian)) cuisines.add("asian");

  if (family === "soup_stew_chili") vibes.add("soup");
  if (family === "sandwich_burger" || family === "mexican_handheld") vibes.add("sandwich");
  if (family === "italian_pasta") vibes.add("pasta");
  if (family === "salad_main" || hasTitle(KW.salad)) vibes.add("salad");
  if (family === "seafood_main" || hasTitle(KW.seafood)) vibes.add("seafood");
  if (hasTitle(KW.grill) || hasTag(KW.grill)) vibes.add("grill");

  const heavySignals = ["cream","cheese","butter","bacon","fried","lasagna","alfredo","casserole","chili"];
  const lightSignals = ["salad","cucumber","vinaigrette","broccoli","steam","grilled","lemon","herb"];

  const heavy = heavySignals.reduce((a, k) => a + ((title.includes(k) || hasIngredient([k])) ? 1 : 0), 0);
  const light = lightSignals.reduce((a, k) => a + ((title.includes(k) || hasIngredient([k])) ? 1 : 0), 0);

  const heaviness = Math.max(0, Math.min(1, (heavy - light + 2) / 6));
  const sweetness = Math.max(0, Math.min(1, (sweetHits + (dessertHit ? 2 : 0)) / 5));

  const shortBad = toks.size <= 2 && !dessertHit && !breakfastHit && !sideHit && !mainHit;
  if (shortBad && family === "generic_main") confidence = Math.min(confidence, 0.48);

  if (title.includes("fries")) {
    course = "side";
    family = "unknown";
    confidence = 0.95;
    vibes.add("fried");
  }
  if (title.includes("cookie")) {
    course = "dessert";
    family = "unknown";
    confidence = 0.95;
  }
  if (title.includes("pancake") || title.includes("waffle")) {
    course = "breakfast";
    family = "breakfast";
    confidence = Math.max(confidence, 0.9);
  }

  return { course, family, cuisines, vibes, sweetness, heaviness, confidence };
}

function intersects(a: Set<string>, b: Set<string>) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

function scoreSideForMain(main: Profile, side: Profile, alreadyUsedSideIds: Set<string>, sideId: string) {
  if (side.course !== "side") return -999;
  if (main.course === "dessert" || main.course === "snack") return -999;

  let score = 0;

  if (alreadyUsedSideIds.has(sideId)) score -= 2.0;

  const mainIsSalady = main.vibes.has("salad");
  const sideIsSalady = side.vibes.has("salad");

  switch (main.family) {
    case "italian_pasta":
    case "italian_main":
      if (side.cuisines.has("italian")) score += 1.6;
      if (sideIsSalady) score += 1.15;
      if (side.heaviness <= 0.45) score += 0.45;
      if (side.heaviness >= 0.7) score -= 0.9;
      break;

    case "mexican_handheld":
      if (side.cuisines.has("mexican")) score += 1.7;
      if (side.heaviness <= 0.55) score += 0.35;
      if (side.cuisines.has("asian") || side.cuisines.has("italian")) score -= 1.4;
      break;

    case "sandwich_burger":
      if (side.vibes.has("fried")) score += 1.2;
      if (sideIsSalady) score += 0.25;
      if (side.cuisines.has("asian")) score -= 1.35;
      break;

    case "soup_stew_chili":
      if (side.vibes.has("salad")) score += 0.75;
      if (side.cuisines.size === 0) score += 0.25;
      if (side.heaviness >= 0.7) score -= 0.45;
      break;

    case "comfort_main":
      if (sideIsSalady) score += 0.95;
      if (side.heaviness <= 0.5) score += 0.35;
      break;

    case "seafood_main":
      if (side.heaviness <= 0.45) score += 0.55;
      if (sideIsSalady) score += 0.45;
      break;

    case "salad_main":
      if (sideIsSalady) score -= 1.2;
      if (side.heaviness <= 0.45) score += 0.2;
      break;

    case "breakfast":
      if (sideIsSalady) score -= 0.9;
      if (side.vibes.has("fried")) score += 0.15;
      if (side.heaviness >= 0.7) score -= 1.1;
      break;

    default:
      if (main.heaviness >= 0.6) {
        if (sideIsSalady) score += 0.75;
        if (side.heaviness <= 0.4) score += 0.4;
        if (side.heaviness >= 0.65) score -= 0.8;
      }
      break;
  }

  if (main.cuisines.size > 0 && intersects(main.cuisines, side.cuisines)) score += 0.8;
  if (main.cuisines.size > 0 && side.cuisines.size === 0) score += 0.1;
  if (main.cuisines.size > 0 && side.cuisines.size > 0 && !intersects(main.cuisines, side.cuisines)) score -= 0.9;

  if (mainIsSalady && sideIsSalady) score -= 1.25;
  score += intersects(main.vibes, side.vibes) ? 0.2 : 0;
  score += (side.confidence - 0.5) * 0.5;

  return score;
}

/* =========================
   Side sanity filters
========================= */

function isLikelySideTitle(recipe: Recipe) {
  const title = normalizeName(recipe.title || "");
  if (!title) return false;

  if (NOT_SIDE_KEYWORDS.some((k) => title.includes(k))) return false;
  if (HARD_MAIN_SIGNALS.some((k) => title.includes(k))) return false;

  const strongSideKeywords = [
    "salad","slaw","fries","chips","pilaf","mashed","potatoes","roasted","steamed","sauteed",
    "green beans","asparagus","broccoli","coleslaw","cornbread","breadsticks","garlic bread","rolls","toast",
  ];

  return strongSideKeywords.some((k) => title.includes(k));
}

function isBreakfastFriendlySideTitle(recipe: Recipe) {
  const title = normalizeName(recipe.title || "");
  if (!title) return false;
  if (NOT_SIDE_KEYWORDS.some((k) => title.includes(k))) return false;
  return BREAKFAST_SIDE_KEYWORDS.some((k) => title.includes(k));
}

/* =========================
   Smart fallback side suggestions (not recipes)
========================= */

function suggestNonRecipeSide(main: Recipe, mainP: Profile): string | null {
  const eff = effectiveCourseForPick(main, mainP.course);

  if (eff && isNonMealCourse(eff)) return null;
  if (eff === "unknown") return null;
  if (mainP.course === "unknown") return null;

  switch (mainP.family) {
    case "breakfast":
      return "Fruit";

    case "soup_stew_chili":
      return "Bread";

    case "italian_pasta":
    case "italian_main":
      return "Garlic bread";

    case "sandwich_burger":
      return "Chips";

    case "mexican_handheld":
      return "Rice";

    case "seafood_main":
      return "Salad";

    case "comfort_main":
      return "Salad";

    case "salad_main":
      return null;

    default:
      if (mainP.heaviness >= 0.65) return "Salad";
      return "Salad";
  }
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

    if (slot.manualSideName) {
      const key = normalizeName(slot.manualSideName);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
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

function scoreRecipePantryFit(recipe: Recipe, storage: StorageItem[]) {
  const ingredients = extractIngredientNames(recipe);
  if (ingredients.length === 0) return 0;

  let matched = 0;
  let missing = 0;

  for (const ing of ingredients) {
    const match = matchStorageToIngredient(storage, ing);
    const qty = match ? coerceNumber(match.quantity, 0) : 0;

    if (match && qty > 0) matched += 1;
    else missing += 1;
  }

  const matchRatio = matched / ingredients.length;

  return Math.round(matchRatio * 120) + matched * 10 - missing * 6;
}
export default function MealPlanningClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { prefs, brainCapacity } = useUIPrefs();
  const prefsForCopy = prefs as any;

  // Background auto-tag (fire-and-forget)
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

  const [showTopDetails, setShowTopDetails] = useState<boolean>(false);
  const shoppingAddSignatureKey = `recipechaos:meal-planning:${weekStartStr}:last-shopping-add-signature`;
  const [lastShoppingAddSignature, setLastShoppingAddSignature] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLastShoppingAddSignature(window.sessionStorage.getItem(shoppingAddSignatureKey) || "");
  }, [shoppingAddSignatureKey]);

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
  }, [weekStartStr]);

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
  }, [weekStartStr]);

  async function loadPlan() {
    setPlanBusy(true);
    setStatus("");

    try {
      const res = await fetch(`/api/meal-plans?start=${weekStartStr}`, { cache: "no-store" });
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
          sideId: x.sideId ?? x.sideRecipeId ?? null,
          suggestedSideId: x.suggestedSideId ?? x.suggested_side_id ?? null,
          manualSideName: x.manualSideName ?? x.manual_side_name ?? null,
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
  }, [weekStartStr]);

  async function savePlan(nextSlots: SlotPlan[]) {
    setSaving(true);
    setStatus("");

    try {
      // send BOTH key styles so API/storage stays happy
      const payload = {
        selected_recipe_ids: nextSlots.map((s) => ({
          slotId: s.slotId,
          mainId: s.mainId,
          sideId: s.sideId,
          suggestedSideId: s.suggestedSideId,
          manualSideName: s.manualSideName,
          recipeId: s.mainId,
          sideRecipeId: s.sideId,
          locked: s.locked,
          cooked: s.cooked,
        })),
      };

      const res = await fetch(`/api/meal-plans?start=${weekStartStr}`, {
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
     Smart fill + smart sides
  ========================= */

  function recipeLooksSideLike(recipe: Recipe) {
    const title = normalizeName(recipe.title || "");
    if (!title) return false;

    // hard block: sauces/components never treated as side-like meal items
    if (NOT_SIDE_KEYWORDS.some((k) => title.includes(k))) return false;

    // baked potato / fries / salad etc: side-like
    if (isLikelySideTitle(recipe)) return true;

    // AI/user say it's a side
    const heuristic = profilesById.get(recipe.id);
    const eff = effectiveCourseForPick(recipe, heuristic?.course);
    return eff === "side";
  }

  // a "main" that is actually side-like should not receive a side (side-of-a-side problem)
  function isValidMainForSides(mainId: string) {
    const r = recipesById.get(mainId);
    const p = profilesById.get(mainId);
    if (!r || !p) return false;

    const eff = effectiveCourseForPick(r, p.course);
    if (!eff) return false;

    if (isNonMealCourse(eff)) return false;
    if (eff === "dessert" || eff === "snack" || eff === "side") return false;

    if (recipeLooksSideLike(r)) return false;

    // meal mains
    if (isMealMainCourse(eff)) return true;

    // fallback
    return p.course === "main" || p.course === "breakfast";
  }

  const mainCandidates = useMemo(() => {
    const ids: string[] = [];
    for (const r of recipes) {
      const heuristic = profilesById.get(r.id);
      const eff = effectiveCourseForPick(r, heuristic?.course);

      if (eff && isNonMealCourse(eff)) continue;
      if (eff === "dessert" || eff === "snack" || eff === "side") continue;

      // don't auto-pick side-like things as mains (baked potato, etc.)
      if (recipeLooksSideLike(r)) continue;

      const p = heuristic;
      if (!p) continue;

      const title = normalizeName(r.title || "");
const looksDessert = KW.dessert.some((k) => title.includes(k));

if (!looksDessert && (p.course === "main" || p.course === "breakfast")) {
  ids.push(r.id);
}
    }
    return ids;
  }, [recipes, profilesById]);

  const sideCandidates = useMemo(() => {
    const ids: string[] = [];

    for (const r of recipes) {
      const title = normalizeName(r.title || "");
      if (!title) continue;

      const heuristic = profilesById.get(r.id);
      const eff = effectiveCourseForPick(r, heuristic?.course);

      // Never auto-pick these as sides
      if (eff && isNonMealCourse(eff)) continue;

      // HARD BLOCK: sauce/butter/etc should never become a side via bad tags
      const userCourse = (r as any)?.user_profile?.course;
      const userExplicitSide = typeof userCourse === "string" && userCourse.toLowerCase().trim() === "side";
      if (!userExplicitSide && NOT_SIDE_KEYWORDS.some((k) => title.includes(k))) continue;

      // Never use these courses as sides automatically
      if (eff === "dessert" || eff === "snack" || eff === "breakfast") continue;

      // If user explicitly says side, allow (user wins)
      if (userExplicitSide) {
        // still don't allow non-meal courses as side
        if (eff && isNonMealCourse(eff)) continue;
        ids.push(r.id);
        continue;
      }

      // strict gate OR title-based side
      const isSideBySignal = eff === "side" || heuristic?.course === "side";
      const isSideByTitle = isLikelySideTitle(r);
      if (!isSideBySignal && !isSideByTitle) continue;

      // block main-looking titles from becoming sides
      if (HARD_MAIN_SIGNALS.some((k) => title.includes(k))) continue;

      ids.push(r.id);
    }

    return ids;
  }, [recipes, profilesById]);


  function scoreMainCandidate(recipeId: string) {
    const r = recipesById.get(recipeId);
    const p = profilesById.get(recipeId);
    if (!r || !p) return -999;

    const userCourse = (r as any)?.user_profile?.course;
    const aiCourse = (r as any)?.ai_profile?.course;
    const eff = effectiveCourseForPick(r, p.course);

    let score = 0;

    if (userCourse === "main") score += 100;
    if (userCourse === "breakfast") score += 35;

    if (userCourse !== "main" && aiCourse === "main") score += 70;
    if (userCourse !== "breakfast" && aiCourse === "breakfast") score += 20;

    if (p.course === "main") score += 40;
    if (p.course === "breakfast") score += 10;

    score += Math.round((p.confidence || 0) * 10);

    score += scoreRecipePantryFit(r, storageItems);

    if (eff === "breakfast") score -= 15;

    return score;
  }

  function sortMainCandidates(ids: string[]) {
    return [...ids].sort((a, b) => scoreMainCandidate(b) - scoreMainCandidate(a));
  }

  function pickSideForMain(mainId: string, usedSideIds: Set<string>) {
    if (!isValidMainForSides(mainId)) return null;

    const mainR = recipesById.get(mainId);
    const mainP = profilesById.get(mainId);
    if (!mainR || !mainP) return null;

    const mainEff = effectiveCourseForPick(mainR, mainP.course);
    const wantsBreakfastSide = mainEff === "breakfast" || mainP.course === "breakfast";

    const scored: { id: string; score: number }[] = [];

    for (const sid of sideCandidates) {
      const sideR = recipesById.get(sid);
      const sideP0 = profilesById.get(sid);
      if (!sideR || !sideP0) continue;

      const sideTitle = normalizeName(sideR.title || "");

      const familyAllowed = (() => {
        switch (mainP.family) {
          case "italian_pasta":
          case "italian_main":
            return sideP0.cuisines.has("italian") || sideTitle.includes("salad") || sideTitle.includes("bread") || sideTitle.includes("roll");

          case "mexican_handheld":
            return sideP0.cuisines.has("mexican") || sideTitle.includes("rice") || sideTitle.includes("beans") || sideTitle.includes("corn") || sideTitle.includes("salad");

          case "sandwich_burger":
            return sideTitle.includes("fries") || sideTitle.includes("chips") || sideTitle.includes("slaw") || sideTitle.includes("salad") || sideTitle.includes("soup");

          case "soup_stew_chili":
            return sideTitle.includes("bread") || sideTitle.includes("cornbread") || sideTitle.includes("salad");

          case "comfort_main":
            return sideTitle.includes("salad") || sideTitle.includes("green beans") || sideTitle.includes("broccoli") || sideTitle.includes("asparagus") || sideTitle.includes("mashed");

          case "seafood_main":
            return sideTitle.includes("salad") || sideTitle.includes("rice") || sideTitle.includes("broccoli") || sideTitle.includes("asparagus") || sideTitle.includes("green beans");

          default:
            return true;
        }
      })();

      if (!familyAllowed) continue;

      if (NOT_SIDE_KEYWORDS.some((k) => sideTitle.includes(k))) continue;
      if (wantsBreakfastSide && !isBreakfastFriendlySideTitle(sideR)) continue;
      if (HARD_MAIN_SIGNALS.some((k) => sideTitle.includes(k))) continue;

      const sideP: Profile = { ...sideP0, course: "side" };
      let sc = scoreSideForMain(mainP, sideP, usedSideIds, sid);

      if (wantsBreakfastSide) {
        sc += isBreakfastFriendlySideTitle(sideR) ? 0.35 : -1.0;
        if (sideTitle.includes("salad")) sc -= 1.0;
      }

      scored.push({ id: sid, score: sc });
    }

    if (scored.length === 0) return null;

    scored.sort((a, b) => b.score - a.score);

    const bestScore = scored[0].score;
    if (bestScore < 1.05) return null;

    const topBand = scored.filter((x) => x.score >= bestScore - 0.15).slice(0, 2);
    const pool = topBand.length > 0 ? topBand : [scored[0]];
    const pick = pool[0];

    return pick?.id ?? null;
  }

  function recomputeSides(nextSlots: SlotPlan[]) {
    const used = new Set<string>();
    const allowedSideSet = new Set(sideCandidates);

    const updated = nextSlots.map((s) => {
      if (!s.mainId) return { ...s, sideId: null };

      if (!isValidMainForSides(s.mainId)) return { ...s, sideId: null };

      const mainR = recipesById.get(s.mainId);
      const mainP = profilesById.get(s.mainId);
      const mainEff = mainR && mainP ? effectiveCourseForPick(mainR, mainP.course) : null;
      const wantsBreakfastSide = mainEff === "breakfast" || mainP?.course === "breakfast";

      // keep committed side only if it is still allowed + still sane for breakfast
      if (s.sideId && allowedSideSet.has(s.sideId)) {
        const sideR = recipesById.get(s.sideId);
        const sideTitle = sideR ? normalizeName(sideR.title || "") : "";

        const hardBad =
          !sideR ||
          NOT_SIDE_KEYWORDS.some((k) => sideTitle.includes(k)) ||
          HARD_MAIN_SIGNALS.some((k) => sideTitle.includes(k));

        const breakfastBad = wantsBreakfastSide && sideR && !isBreakfastFriendlySideTitle(sideR);

        if (!hardBad && !breakfastBad) {
          used.add(s.sideId);
          return { ...s, suggestedSideId: null };
        }
      }

      const picked = pickSideForMain(s.mainId, used);
      if (picked) used.add(picked);

      return { ...s, sideId: null, suggestedSideId: picked ?? null };
    });

    return updated;
  }

  async function doItForMe() {
    if (recipes.length === 0) return;

    const candidates = sortMainCandidates(mainCandidates);
    const usedMain = new Set<string>(slots.map((s) => s.mainId).filter(Boolean) as string[]);

    const next = slots.map((s) => {
      if (s.locked) return s;
      return { ...s, mainId: null, sideId: null, suggestedSideId: null, cooked: false };
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

    const candidates = sortMainCandidates(mainCandidates);
    const lockedMain = new Set<string>(
      slots.filter((s) => s.locked && s.mainId).map((s) => s.mainId!) as string[]
    );

    const next = slots.map((s) => {
      if (s.locked) return s;
      return { ...s, mainId: null, sideId: null, suggestedSideId: null, cooked: false };
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
    const allowedSideSet = new Set(sideCandidates);

    const next = (() => {
      const used = new Set<string>(slots.map((s) => s.sideId || s.suggestedSideId).filter(Boolean) as string[]);

      return slots.map((s) => {
        if (s.slotId !== slotId) return s;
        if (!s.mainId) return s;

        if (!isValidMainForSides(s.mainId)) return { ...s, sideId: null, suggestedSideId: null };

        const mainR = recipesById.get(s.mainId);
        const mainP = profilesById.get(s.mainId);
        const mainEff = mainR && mainP ? effectiveCourseForPick(mainR, mainP.course) : null;
        const wantsBreakfastSide = mainEff === "breakfast" || mainP?.course === "breakfast";

        if (s.suggestedSideId) used.delete(s.suggestedSideId);

        let best: { id: string; score: number } | null = null;
        for (const sid of sideCandidates) {
          if (sid === s.suggestedSideId) continue;
          if (!allowedSideSet.has(sid)) continue;

          const sideR = recipesById.get(sid);
          const sideP0 = profilesById.get(sid);
          if (!sideR || !sideP0) continue;

          const sideTitle = normalizeName(sideR.title || "");

          if (NOT_SIDE_KEYWORDS.some((k) => sideTitle.includes(k))) continue;
          if (HARD_MAIN_SIGNALS.some((k) => sideTitle.includes(k))) continue;

          if (wantsBreakfastSide && !isBreakfastFriendlySideTitle(sideR)) continue;

          const sideP: Profile = { ...sideP0, course: "side" };
          let sc = scoreSideForMain(mainP!, sideP, used, sid);

          if (wantsBreakfastSide) {
            sc += isBreakfastFriendlySideTitle(sideR) ? 0.35 : -1.0;
            if (sideTitle.includes("salad")) sc -= 1.0;
          }

          if (best == null || sc > best.score) best = { id: sid, score: sc };
        }

        const nextSide = best && best.score >= 0.35 ? best.id : null;
        if (nextSide) used.add(nextSide);

        return { ...s, suggestedSideId: nextSide };
      });
    })();

    setSlots(next);
    await savePlan(next);
  }


  async function acceptSuggestedSide(slotId: string) {
    const next = slots.map((s) => {
      if (s.slotId !== slotId) return s;
      if (!s.mainId || !s.suggestedSideId) return s;
      return { ...s, sideId: s.suggestedSideId, suggestedSideId: null, manualSideName: null };
    });

    setSlots(next);
    await savePlan(next);
  }

  async function acceptNonRecipeSide(slotId: string, sideName: string) {
    const clean = sideName.trim();
    if (!clean) return;

    const next = slots.map((s) => {
      if (s.slotId !== slotId) return s;
      if (!s.mainId) return s;
      return { ...s, sideId: null, suggestedSideId: null, manualSideName: clean };
    });

    setSlots(next);
    await savePlan(next);
  }

  async function removeCommittedSide(slotId: string) {
    const next = slots.map((s) => {
      if (s.slotId !== slotId) return s;
      return { ...s, sideId: null, manualSideName: null };
    });

    const withSides = recomputeSides(next);
    setSlots(withSides);
    await savePlan(withSides);
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
      setStatus("Nothing missing");
      setTimeout(() => setStatus(""), 1200);
      return;
    }

    const signature = JSON.stringify(
      miss
        .slice(0, 60)
        .map((m) => `${m.key}:${Math.max(1, m.needed - m.have)}`)
        .sort()
    );

    if (signature === lastShoppingAddSignature) {
      setStatus("Already added");
      setTimeout(() => setStatus(""), 1200);
      return;
    }

    setStatus("Adding...");
    try {
      for (const m of miss.slice(0, 60)) {
        const qty = Math.max(1, m.needed - m.have);
        const name = m.display;

        await fetch("/api/shopping-list/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, quantity: qty, isDerived: true }),
        });
      }

      setLastShoppingAddSignature(signature);
      window.sessionStorage.setItem(shoppingAddSignatureKey, signature);
      setStatus("Shopping list updated");
      setTimeout(() => setStatus(""), 1200);
    } catch (e: any) {
      setStatus(e?.message || "Failed to update shopping list");
    }
  }

  async function markCooked(slotId: string) {
    const slot = slots.find((s) => s.slotId === slotId);
    if (!slot || !slot.mainId) return;

    const next = slots.map((s) => (s.slotId === slotId ? { ...s, cooked: true } : s));
    setSlots(next);
    await savePlan(next);
  }

  /* =========================
     UI
========================= */

  const box = "rounded-3xl bg-[color:var(--card)] ring-1 ring-[color:var(--border)]";
  const pill =
    "rounded-full bg-[color:var(--card)] hover:bg-[color:var(--hover)] px-4 py-2 text-xs font-semibold ring-1 ring-[color:var(--border)] transition";
  const pillActive =
    "rounded-full bg-emerald-400/25 hover:bg-emerald-400/30 px-4 py-2 text-xs font-extrabold ring-1 ring-[color:var(--border)] transition";
  const tinyBtn =
    "rounded-full bg-[color:var(--card)] hover:bg-[color:var(--hover)] px-3 py-1.5 text-xs font-semibold ring-1 ring-[color:var(--border)] transition";

  const header = (
    <div className="mt-2">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-4xl font-extrabold">{pageTitle}</h1>
          <div className="text-sm opacity-70">
            Week: {weekStartStr} → {weekEndStr}
            {status ? `  -  ${status}` : ""}
          </div>
        </div>

        <div className="flex flex-wrap items-stretch gap-2 lg:items-center">
          <button
            type="button"
            onClick={() => goToWeek(addDays(weekStart, -7))}
            className="rounded-full bg-[color:var(--card)] hover:bg-[color:var(--card)] px-4 py-2 text-sm font-semibold ring-1 ring-[color:var(--border)] transition"
            title="Previous week"
          >
            ←
          </button>

          <button
            type="button"
            onClick={() => goToWeek(addDays(weekStart, +7))}
            className="rounded-full bg-[color:var(--card)] hover:bg-[color:var(--card)] px-4 py-2 text-sm font-semibold ring-1 ring-[color:var(--border)] transition"
            title="Next week"
          >
            →
          </button>

          <button
            type="button"
            onClick={doItForMe}
            disabled={loadingRecipes || recipes.length === 0 || saving || planBusy}
            className="rounded-full bg-emerald-400/80 hover:bg-emerald-400 px-5 py-3 text-sm font-extrabold text-black disabled:opacity-50 ring-1 ring-[color:var(--border)] transition shadow-lg shadow-emerald-400/10"
          >
            {saving || planBusy ? "Working..." : "Do it for me"}
          </button>

          <button
            type="button"
            onClick={regenerateUnlocked}
            disabled={loadingRecipes || recipes.length === 0 || saving || planBusy}
            className="rounded-full bg-[color:var(--card)] hover:bg-[color:var(--hover)] px-5 py-3 text-sm font-semibold ring-1 ring-[color:var(--border)] transition disabled:opacity-50"
            title="Keep locked meals; regenerate the rest"
          >
            Regenerate (unlocked)
          </button>

          <button
            type="button"
            onClick={async () => {
              const next = makeEmptySlots(mealCount);
              setSlots(next);
              await savePlan(next);
            }}
            disabled={saving || planBusy}
            className="rounded-full bg-[color:var(--card)] hover:bg-[color:var(--hover)] px-5 py-3 text-sm font-semibold ring-1 ring-[color:var(--border)] transition disabled:opacity-50"
            title="Clear the whole plan"
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
            disabled={saving || planBusy}
            className="rounded-full bg-[color:var(--card)] hover:bg-[color:var(--hover)] px-5 py-3 text-sm font-semibold ring-1 ring-[color:var(--border)] transition disabled:opacity-50"
            title="Re-pick sides for current mains"
          >
            Re-pick sides
          </button>

          <button
            type="button"
            onClick={addMissingToShoppingList}
            disabled={loadingStorage || pantryProjection.missing.length === 0}
            className="rounded-full bg-[color:var(--card)] hover:bg-[color:var(--hover)] px-5 py-3 text-sm font-semibold ring-1 ring-[color:var(--border)] transition disabled:opacity-50"
            title="Add missing ingredients to shopping list"
          >
            Add → Shopping list
          </button>

          <button
            type="button"
            onClick={() => setShowTopDetails((v) => !v)}
            className="rounded-full bg-[color:var(--card)] hover:bg-[color:var(--hover)] px-4 py-2 text-sm font-semibold ring-1 ring-[color:var(--border)] transition"
            title="Show/hide pantry + notes"
          >
            {showTopDetails ? "Hide details" : "Show details"}
          </button>
        </div>
      </div>

      {showTopDetails ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className={[box, "p-5 text-[color:var(--text)]"].join(" ")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold tracking-tight">Pantry projection</div>
                <div className="mt-1 text-sm text-[color:var(--muted)]">
                  Based on your plan (mains + sides). Approximate, but helpful.
                </div>
              </div>
              <button type="button" onClick={loadStorage} className={tinyBtn} disabled={loadingStorage}>
                {loadingStorage ? "Refreshing..." : "Refresh pantry"}
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
                          <div className="font-semibold text-[color:var(--text)] truncate">{m.matchedName || m.display}</div>
                          <div className="text-xs text-[color:var(--muted)]">
                            need {m.needed}  -  have {m.have}
                          </div>
                        </div>
                        <div className="text-xs text-[color:var(--muted)] shrink-0">+{Math.max(1, m.needed - m.have)}</div>
                      </div>
                    ))}

                    {pantryProjection.missing.length > 8 ? (
                      <div className="text-xs text-[color:var(--muted-2)] mt-2">...and {pantryProjection.missing.length - 8} more</div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 text-sm text-[color:var(--text-soft)]">
                    No obvious gaps. (Either you're stocked, or the pantry isn't fully tracked yet.)
                  </div>
                )}
              </>
            )}
          </div>

          <div className={[box, "p-5 text-[color:var(--text)]"].join(" ")}>
            <div className="text-lg font-extrabold tracking-tight">Side rules (smarter)</div>
            <div className="mt-2 text-sm text-[color:var(--muted)] space-y-2">
              <div> -  Butter/sauce/dressing/marinade/etc are hard-blocked as sides.</div>
              <div> -  Breakfast mains only accept breakfast-ish sides (fruit/yogurt/toast/etc).</div>
              <div> -  Side-like "mains" (baked potato, etc) won't get a "side of a side".</div>
              <div> -  If no recipe side fits, you still get a sensible non-recipe suggestion.</div>
            </div>
          </div>

          <div className={[box, "p-5 text-[color:var(--text)]"].join(" ")}>
            <div className="text-lg font-extrabold tracking-tight">Tip</div>
            <div className="mt-2 text-sm text-[color:var(--muted)]">
              Lock the meals you want, then spam "Regenerate (unlocked)" until the chaos behaves.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <RcPageShell header={header}>
      <div className="mt-8">
        {loadingRecipes ? (
          <div className="text-[color:var(--text-soft)]">Loading...</div>
        ) : recipesError ? (
          <div className="text-red-400">{recipesError}</div>
        ) : (
          <div className="grid gap-4">
            {slots.map((slot, idx) => {
              const main = slot.mainId ? recipesById.get(slot.mainId) : null;
              const committedSide = slot.sideId ? recipesById.get(slot.sideId) : null;
              const suggestedSide = slot.suggestedSideId ? recipesById.get(slot.suggestedSideId) : null;
              const side = committedSide ?? suggestedSide ?? null;

              const mainP = slot.mainId ? profilesById.get(slot.mainId) : null;

              const effectiveMainCourse = main ? effectiveCourseForPick(main, mainP?.course) : null;

              const uncertainMain =
                !!mainP &&
                (effectiveMainCourse === "unknown" ||
                  (mainP.confidence < 0.5 && titleTokens(main ?? { id: "", title: "" }).size <= 2));

              const nonRecipeSuggestion =
                main && mainP && !slot.sideId && !slot.suggestedSideId && isValidMainForSides(main.id)
                  ? suggestNonRecipeSide(main, mainP)
                  : null;

              return (
                <div key={slot.slotId} className="rounded-3xl bg-[color:var(--card)] p-5 ring-1 ring-[color:var(--border)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="font-extrabold text-[color:var(--text)]">Meal {idx + 1}</div>

                      {slot.locked ? (
                        <span className="rounded-full bg-emerald-400/25 px-3 py-1 text-xs font-extrabold text-[color:var(--text)] ring-1 ring-[color:var(--border)]">
                          Locked
                        </span>
                      ) : (
                        <span className="rounded-full bg-[color:var(--card)] px-3 py-1 text-xs font-semibold text-[color:var(--text-soft)] ring-1 ring-[color:var(--border)]">
                          Unlocked
                        </span>
                      )}

                      {slot.cooked ? (
                        <span className="rounded-full bg-[color:var(--card)] px-3 py-1 text-xs font-semibold text-[color:var(--text-soft)] ring-1 ring-[color:var(--border)]">
                          Cooked
                        </span>
                      ) : null}

                      {uncertainMain ? (
                        <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-extrabold text-[color:var(--text)] ring-1 ring-[color:var(--border)]">
                          Not sure what this is yet
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-stretch gap-2 lg:items-center">
                      <button
                        type="button"
                        onClick={async () => {
                          const next = slots.map((s) => (s.slotId === slot.slotId ? { ...s, locked: !s.locked } : s));
                          setSlots(next);
                          await savePlan(next);
                        }}
                        className="rounded-full bg-[color:var(--card)] hover:bg-[color:var(--hover)] px-4 py-2 text-xs font-semibold ring-1 ring-[color:var(--border)] transition"
                      >
                        {slot.locked ? "Unlock" : "Lock"}
                      </button>

                      <button
                        type="button"
                        onClick={() => swapSide(slot.slotId)}
                        disabled={!slot.mainId}
                        className="rounded-full bg-[color:var(--card)] hover:bg-[color:var(--hover)] px-4 py-2 text-xs font-semibold ring-1 ring-[color:var(--border)] transition disabled:opacity-50"
                        title="Swap the side suggestion"
                      >
                        Swap side
                      </button>

                      {suggestedSide && !committedSide ? (
                        <button
                          type="button"
                          onClick={() => acceptSuggestedSide(slot.slotId)}
                          className="rounded-full bg-emerald-400/20 hover:bg-emerald-400/25 px-4 py-2 text-xs font-extrabold ring-1 ring-[color:var(--border)] transition"
                          title="Accept this side suggestion"
                        >
                          Accept side
                        </button>
                      ) : null}

                      {committedSide || slot.manualSideName ? (
                        <button
                          type="button"
                          onClick={() => removeCommittedSide(slot.slotId)}
                          className="rounded-full bg-[color:var(--card)] hover:bg-[color:var(--hover)] px-4 py-2 text-xs font-semibold ring-1 ring-[color:var(--border)] transition"
                          title="Remove the committed side"
                        >
                          Remove side
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => markCooked(slot.slotId)}
                        disabled={!slot.mainId || slot.cooked}
                        className="rounded-full bg-emerald-400/20 hover:bg-emerald-400/25 px-4 py-2 text-xs font-extrabold ring-1 ring-[color:var(--border)] transition disabled:opacity-50"
                        title="Mark this meal as cooked"
                      >
                        {slot.cooked ? "Cooked" : "Mark cooked"}
                      </button>

                      {main ? (
                        <Link href={`/recipes/${main.id}`} className="text-xs underline text-[color:var(--text-soft)]">
                          View main
                        </Link>
                      ) : null}

                      {committedSide ? (
                        <Link href={`/recipes/${committedSide.id}`} className="text-xs underline text-[color:var(--muted)]">
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
                        s.slotId === slot.slotId
                          ? { ...s, mainId: value, cooked: false, sideId: null, suggestedSideId: null, manualSideName: null }
                          : s
                      );

                      const withSides = recomputeSides(next);
                      setSlots(withSides);
                      await savePlan(withSides);
                    }}
                    className="mt-3 w-full rounded-2xl bg-[color:var(--card)] p-3 text-[color:var(--text)] ring-1 ring-[color:var(--border)]"
                  >
                    <option value="">None</option>

                    <optgroup label="Good mains (auto-picked)">
                      {recipes
                        .filter((r) => {
                          const heuristic = profilesById.get(r.id);
                          const eff = effectiveCourseForPick(r, heuristic?.course);
                          if (eff && isNonMealCourse(eff)) return false;
                          if (eff === "dessert" || eff === "snack" || eff === "side") return false;
                          if (recipeLooksSideLike(r)) return false;
                          const p = heuristic;
                          return p?.course === "main" || p?.course === "breakfast";
                        })
                        .map((rec) => (
                          <option key={rec.id} value={rec.id}>
                            {rec.favorite ? "★ " : ""}
                            {rec.title}
                          </option>
                        ))}
                    </optgroup>

                    <optgroup label="Everything else (allowed, but not auto-picked)">
                      {recipes.map((rec) => (
                        <option key={rec.id} value={rec.id}>
                          {rec.favorite ? "★ " : ""}
                          {rec.title}
                        </option>
                      ))}
                    </optgroup>
                  </select>

                  <div className="mt-3 text-sm text-[color:var(--text-soft)]">
                    <span className="text-[color:var(--muted)]">Side:</span>{" "}
                    {slot.mainId ? (
                      committedSide ? (
                        <span>
                          <Link href={`/recipes/${committedSide.id}`} className="underline">
                            {committedSide.title}
                          </Link>{" "}
                          <span className="text-[color:var(--muted-2)]">(attached)</span>
                        </span>
                      ) : slot.manualSideName ? (
                        <span className="text-[color:var(--text-soft)]">
                          {slot.manualSideName} <span className="text-[color:var(--muted-2)]">(attached)</span>
                        </span>
                      ) : suggestedSide ? (
                        <span className="text-[color:var(--text-soft)]">
                          {suggestedSide.title} <span className="text-[color:var(--muted-2)]">(suggested)</span>
                        </span>
                      ) : (
                        <span className="text-[color:var(--muted-2)]">None</span>
                      )
                    ) : (
                      <span className="text-[color:var(--muted-2)]">Pick a main first</span>
                    )}
                  </div>

                  {slot.mainId && !slot.sideId && !slot.manualSideName && nonRecipeSuggestion ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
                      <span>
                        Suggested side (not a recipe):{" "}
                        <span className="text-[color:var(--text-soft)] font-semibold">{nonRecipeSuggestion}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => acceptNonRecipeSide(slot.slotId, nonRecipeSuggestion)}
                        className="rounded-full bg-emerald-400/20 hover:bg-emerald-400/25 px-3 py-1 text-xs font-extrabold ring-1 ring-[color:var(--border)] transition"
                        title="Attach this non-recipe side"
                      >
                        Attach side
                      </button>
                    </div>
                  ) : null}

                  {slot.mainId && main && mainP ? (
                    <div className="mt-2 text-xs text-[color:var(--muted-2)]">
                      {(() => {
                        const effective = effectiveCourseForPick(main, mainP.course);
                        const shown = effective ?? (mainP.course === "breakfast" ? "breakfast" : mainP.course);
                        const src = null;

                        return (
                          <>
                            Classified as <span className="text-[color:var(--muted)] font-semibold">{shown}</span>
                            {src ? <span className="text-[color:var(--muted-2)]">  -  {src}</span> : null}
                          </>
                        );
                      })()}
                      {mainP.vibes.size > 0 ? (
                        <>
                          {" "}
                           -  vibe: <span className="text-[color:var(--muted)]">{Array.from(mainP.vibes).slice(0, 3).join(", ")}</span>
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































































