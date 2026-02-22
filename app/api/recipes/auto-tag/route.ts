import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Course =
  | "main"
  | "side"
  | "breakfast"
  | "dessert"
  | "snack"
  | "sauce"
  | "component"
  | "drink"
  | "unknown";

type AiProfile = {
  course: Course;
  confidence?: number;
  reasons?: string[];
  version?: string;
};

function norm(s: string) {
  return (s || "").toLowerCase().trim();
}

function hasAny(text: string, words: string[]) {
  return words.some((w) => text.includes(w));
}

function scoreHits(text: string, words: string[]) {
  let score = 0;
  for (const w of words) if (text.includes(w)) score += 1;
  return score;
}

// ---- keywords ----

const BREAKFAST_WORDS = [
  "breakfast",
  "pancake",
  "waffle",
  "french toast",
  "toast",
  "omelet",
  "omelette",
  "scrambled egg",
  "fried egg",
  "hashbrown",
  "hash brown",
  "breakfast burrito",
  "breakfast sandwich",
  "granola",
  "oatmeal",
  "porridge",
  "yogurt",
  "cereal",
  "muffin",
  "bagel",
];

// IMPORTANT: drink should be TITLE-led.
// Ingredients often contain wine/beer/etc, which should not flip food into "drink".
const DRINK_TITLE_WORDS = [
  "smoothie",
  "milkshake",
  "shake",
  "latte",
  "cappuccino",
  "coffee",
  "espresso",
  "tea",
  "chai",
  "lemonade",
  "cocktail",
  "mocktail",
  "sangria",
  "margarita",
  "mojito",
  "spritz",
  "beer",
  "wine",
];

const SAUCE_TITLE_WORDS = [
  "sauce",
  "gravy",
  "dressing",
  "vinaigrette",
  "aioli",
  "marinade",
  "glaze",
  "dip",
  "salsa",
  "pesto",
  "chimichurri",
  "relish",
  "spread",
];

const COMPONENT_TITLE_WORDS = [
  "seasoning",
  "rub",
  "mix",
  "spice blend",
  "stock",
  "broth",
  "starter",
  "roux",
  "base",
  "filling",
];

// €œbutter€ is tricky: butter can be ingredient, or can be a compound butter recipe (component).
const BUTTER_COMPONENT_TITLE_WORDS = ["garlic butter", "compound butter", "herb butter"];

const HARD_MAIN_TITLE_SIGNALS = [
  "taco",
  "tacos",
  "burrito",
  "enchilada",
  "lasagna",
  "spaghetti",
  "meatloaf",
  "stew",
  "chili",
  "casserole",
  "parmesan",
  "shepherd",
  "shepherd's pie",
  "shepherds pie",
  "pot pie",
  "chicken pot pie",
  "burger",
  "sandwich",
  "grilled cheese",
  "quesadilla",
  "pizza",
  "ramen",
  "curry",
  "roast",
  "spring roll",
  "spring rolls",
  "rolls", // for vietnamese spring rolls titles
];

const SIDE_TITLE_WORDS = [
  "salad",
  "slaw",
  "garlic bread",
  "breadsticks",
  "bread sticks",
  "rice",
  "beans",
  "corn",
  "vegetable",
  "veggies",
  "carrots",
  "potato",
  "baked potato",
  "mashed",
  "fries",
  "roasted",
  "steamed",
  "side",
];

const DESSERT_STRONG_WORDS = [
  "cake",
  "cookie",
  "cookies",
  "brownie",
  "brownies",
  "cupcake",
  "cupcakes",
  "frosting",
  "icing",
  "cheesecake",
  "pudding",
  "ice cream",
  "gelato",
  "sorbet",
  "donut",
  "doughnut",
  "cinnamon roll",
  "pie", // guarded below
  "tart",
  "sweet",
  "chocolate",
  "vanilla",
  "strawberry",
  "blueberry",
  "apple pie",
  "pumpkin pie",
  "pecan pie",
];

const DESSERT_WEAK_WORDS = ["dessert", "treat", "candied", "glazed"];

function classifyRecipe(titleRaw: string, ingredientsRaw?: string, instructionsRaw?: string) {
  const title = norm(titleRaw);

  // We still keep blob for dessert/breakfast support, but not for "drink"
  const blob = norm([titleRaw, ingredientsRaw, instructionsRaw].filter(Boolean).join(" | "));

  const reasons: string[] = [];
  const add = (r: string) => reasons.push(r);

  // 0) Hard guardrail: salad is never dessert/drink/sauce
  if (title.includes("salad")) {
    add("salad-hard-rule");
    const mealSaladSignals = ["chicken", "steak", "salmon", "shrimp", "taco", "cobb", "chef", "protein"];
    if (hasAny(title, mealSaladSignals)) {
      add("meal-salad-signal");
      return { course: "main" as Course, reasons };
    }
    return { course: "side" as Course, reasons };
  }

  // 1) Breakfast (blob ok)
  if (scoreHits(blob, BREAKFAST_WORDS) >= 1) {
    add("breakfast-signal");
    return { course: "breakfast" as Course, reasons };
  }

  // 2) If TITLE says sauce/dressing/etc, it is sauce (even if wine is in ingredients)
  if (scoreHits(title, SAUCE_TITLE_WORDS) >= 1) {
    // Sandwich rule: never sauce
    if (title.includes("sandwich") || title.includes("burger") || title.includes("grilled cheese")) {
      add("sandwich-hard-main-overrides-sauce-title");
      return { course: "main" as Course, reasons };
    }
    add("sauce-title-rule");
    return { course: "sauce" as Course, reasons };
  }

  // 3) Butter/component title rules
  if (hasAny(title, BUTTER_COMPONENT_TITLE_WORDS)) {
    add("butter-component-title");
    return { course: "component" as Course, reasons };
  }

  if (scoreHits(title, COMPONENT_TITLE_WORDS) >= 1) {
    if (title.includes("sandwich") || title.includes("burger") || title.includes("grilled cheese")) {
      add("sandwich-hard-main-overrides-component-title");
      return { course: "main" as Course, reasons };
    }
    add("component-title-rule");
    return { course: "component" as Course, reasons };
  }

  // 4) Hard mains should win BEFORE drink.
  // Prevents tacos/parmesan/spring rolls/shepherd's pie from becoming drink because of €œwine€ in ingredients.
  if (scoreHits(title, HARD_MAIN_TITLE_SIGNALS) >= 1) {
    add("hard-main-title-signal");
    return { course: "main" as Course, reasons };
  }

  // 5) Drink should be title-led only (or very explicit)
  if (scoreHits(title, DRINK_TITLE_WORDS) >= 1) {
    add("drink-title-signal");
    return { course: "drink" as Course, reasons };
  }

  // 6) Dessert with savory-pie guards
  const hasPie = title.includes("pie");
  const savoryPieGuards = ["shepherd", "pot pie", "chicken pot", "meat pie", "beef pie", "turkey pie"];
  if (hasPie && hasAny(title, savoryPieGuards)) {
    add("savory-pie-guard");
    return { course: "main" as Course, reasons };
  }

  const dessertStrong = scoreHits(blob, DESSERT_STRONG_WORDS);
  const dessertWeak = scoreHits(blob, DESSERT_WEAK_WORDS);

  if (hasPie) {
    const sweetSignals = ["apple", "pumpkin", "pecan", "chocolate", "vanilla", "berry", "sweet", "dessert"];
    if (hasAny(blob, sweetSignals)) {
      add("pie+sweet-signal");
      return { course: "dessert" as Course, reasons };
    }
    add("pie-without-sweet-signal");
  }

  if (dessertStrong >= 2 || (dessertStrong >= 1 && dessertWeak >= 1)) {
    add("dessert-strong-signal");
    return { course: "dessert" as Course, reasons };
  }

  // 7) Side signals
  if (scoreHits(title, SIDE_TITLE_WORDS) >= 1) {
    add("side-title-signal");
    return { course: "side" as Course, reasons };
  }

  add("fallback-unknown");
  return { course: "unknown" as Course, reasons };
}

function getServerSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;
    const debug = !!body?.debug;
    const limit = Number(body?.limit ?? 50);

    const supabase = getServerSupabase();
    if (!supabase) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Supabase server client not configured. Need SUPABASE_URL and (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY).",
        },
        { status: 500 }
      );
    }

    const { data: recipes, error } = await supabase
      .from("recipes")
      .select("id,title,ingredients,instructions,ai_profile")
      .limit(limit);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const preview: any[] = [];
    let updated = 0;

    for (const r of recipes ?? []) {
      const before = (r.ai_profile as AiProfile) || null;
      const result = classifyRecipe(r.title, r.ingredients, r.instructions);

      const after: AiProfile = {
        course: result.course,
        reasons: debug ? result.reasons : undefined,
        version: "auto-tag-v4-title-led-drinks",
        confidence: 0.8,
      };

      preview.push({ id: r.id, title: r.title, before, after });

      if (!dryRun) {
        const { error: upErr } = await supabase.from("recipes").update({ ai_profile: after }).eq("id", r.id);
        if (!upErr) updated += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      scanned: recipes?.length ?? 0,
      updated: dryRun ? 0 : updated,
      preview,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

