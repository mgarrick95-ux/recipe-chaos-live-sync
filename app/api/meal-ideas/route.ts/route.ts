import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// POST /api/meal-ideas
export async function POST() {
  try {
    // 1️⃣ Load FrostPantry items from Supabase
    const { data, error } = await supabase
      .from("frostpantry_items")
      .select("*")
      .order("stored_on", { ascending: true });

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Could not load items" },
        { status: 500 }
      );
    }

    // 2️⃣ Build a prompt for the AI
    const pantryText = data
      .map(
        (item) =>
          `${item.name} — Qty: ${item.quantity ?? "?"}, Meals: ${
            item.total_meals ?? "?"
          }, Category: ${item.category ?? "?"}, Age: ${
            item.stored_on ?? "?"
          }, Leftover: ${item.is_leftover ? "Yes" : "No"}`
      )
      .join("\n");

    const prompt = `
You are FrostPantryAI — an assistant that helps plan meals based only on what's in the user's freezer & pantry.

Here is the user's full inventory:

${pantryText}

Create:
1. A brief plan for tonight.
2. 3–5 meal ideas using the items they should use first (urgent or soon).
3. Combine leftovers if appropriate.
4. Suggest what needs to be thawed or prepped.

Keep it short, friendly, and practical. No fancy ingredients not in the list.
`;

    // 3️⃣ Ask OpenAI for ideas
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const ideas = completion.choices[0].message.content;

    // 4️⃣ Send ideas back
    return NextResponse.json({ ideas: mealIdeasArray });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 }
    );
  }
}
