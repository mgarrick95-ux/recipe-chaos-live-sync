import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/* ======================================================
   Types (local, no shared dependency yet)
====================================================== */

type RecipeAIProfile = {
  version: 1;
  course:
    | "main"
    | "side"
    | "breakfast"
    | "dessert"
    | "snack"
    | "sauce"
    | "component"
    | "drink";
  cuisines: string[];
  vibes: string[];
  pairing: string[];
  confidence: number;
  notes?: string;
};

/* ======================================================
   Keyword signals (lightweight, deterministic)
   AI can replace this later
====================================================== */

const COURSE_SIGNALS = {
  breakfast: ["pancake", "waffle", "omelet", "omelette", "scrambled", "breakfast"],
  dessert: ["cookie", "cake", "brownie", "dessert", "sweet"],
  sauce: ["sauce", "dressing", "gravy", "aioli", "marinade"],
  component: ["butter", "garlic butter", "compound butter"],
  drink: ["smoothie", "cocktail", "drink"],
};

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/* ======================================================
   Core classifier (safe + explainable)
====================================================== */

function classifyRecipe(recipe: any): RecipeAIProfile {
  const title = normalize(recipe.title || "");
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map(normalize).join(" ")
    : "";

  const text = `${title} ${ingredients}`;

  // --- COURSE ---
  let course: RecipeAIProfile["course"] = "main";
  let confidence = 0.6;
  let notes = "";

  if (COURSE_SIGNALS.breakfast.some(k => text.includes(k))) {
    course = "breakfast";
    confidence = 0.9;
    notes = "Breakfast keyword detected";
  } else if (COURSE_SIGNALS.sauce.some(k => text.includes(k))) {
    course = "sauce";
    confidence = 0.95;
    notes = "Sauce/condiment detected";
  } else if (COURSE_SIGNALS.component.some(k => text.includes(k))) {
    course = "component";
    confidence = 0.95;
    notes = "Component detected";
  } else if (COURSE_SIGNALS.dessert.some(k => text.includes(k))) {
    course = "dessert";
    confidence = 0.85;
    notes = "Dessert keyword detected";
  } else if (COURSE_SIGNALS.drink.some(k => text.includes(k))) {
    course = "drink";
    confidence = 0.9;
    notes = "Drink detected";
  }

  // --- CUISINE / VIBE (minimal for now) ---
  const cuisines: string[] = [];
  const vibes: string[] = [];
  const pairing: string[] = [];

  if (text.includes("pasta")) {
    vibes.push("pasta");
    pairing.push("pairs_with_pasta");
  }
  if (text.includes("grill") || text.includes("grilled")) {
    vibes.push("grilled");
    pairing.push("pairs_with_grilled_meat");
  }

  return {
    version: 1,
    course,
    cuisines,
    vibes,
    pairing,
    confidence,
    notes,
  };
}

/* ======================================================
   POST handler
====================================================== */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body.dryRun);
    const limit = Number(body.limit) || 25;
    const debug = Boolean(body.debug);

    const { data: recipes, error } = await supabaseServer
      .from("recipes")
      .select("id,title,ingredients,ai_profile")
      .is("ai_profile", null)
      .limit(limit);

    if (error) throw error;

    const preview: any[] = [];
    let updated = 0;

    for (const r of recipes ?? []) {
      const profile = classifyRecipe(r);

      preview.push({
        id: r.id,
        title: r.title,
        profile,
      });

      if (!dryRun) {
        const { error: upErr } = await supabaseServer
          .from("recipes")
          .update({ ai_profile: profile })
          .eq("id", r.id);

        if (upErr) throw upErr;
        updated++;
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      scanned: recipes?.length ?? 0,
      updated,
      preview: debug ? preview : preview.slice(0, 10),
      note: dryRun
        ? "Dry run only. No database writes."
        : "Profiles written successfully.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "auto-tag failed" },
      { status: 500 }
    );
  }
}
