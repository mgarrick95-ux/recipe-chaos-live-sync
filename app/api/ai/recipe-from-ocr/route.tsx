// app/api/ai/recipe-from-ocr/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

type Body = {
  rawText?: string;
};

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY is missing" },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const rawText = (body.rawText || "").trim();

    if (!rawText) {
      return NextResponse.json(
        { ok: false, error: "rawText is required" },
        { status: 400 }
      );
    }

    // guardrails (prevents runaway token costs if OCR goes crazy)
    const clipped = rawText.slice(0, 12000);

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const model =
      process.env.OPENAI_RECIPE_MODEL ||
      process.env.OPENAI_MODEL_SMART ||
      process.env.OPENAI_MODEL_FAST ||
      "gpt-4.1-mini";

    const response = await client.responses.create({
      model,

      // ✅ Responses API structured output (NOT response_format)
      text: {
        format: {
          type: "json_schema",
          name: "recipe_from_ocr",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              ingredients: { type: "array", items: { type: "string" } },
              instructions: { type: "array", items: { type: "string" } },
            },
            required: ["title", "ingredients", "instructions"],
          },
        },
      },

      input: [
        {
          role: "system",
          content:
            "You clean OCR text from recipe photos. Extract a usable recipe. " +
            "Return ONLY the JSON object requested by the schema. " +
            "Do not include commentary or extra keys. " +
            "If something is unclear, make a best guess but keep items short and practical.",
        },
        {
          role: "user",
          content:
            "Clean and extract this OCR text into title, ingredients, and instructions.\n\nOCR:\n" +
            clipped,
        },
      ],
    });

    const jsonText = (response.output_text || "").trim();

    let data: any;
    try {
      data = JSON.parse(jsonText);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Model did not return valid JSON.", raw: jsonText },
        { status: 500 }
      );
    }

    const recipe = {
      title: typeof data.title === "string" ? data.title : "Untitled recipe",
      ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
      instructions: Array.isArray(data.instructions) ? data.instructions : [],
    };

    // Return BOTH keys so client code doesn't break if it expects either
    return NextResponse.json({
      ok: true,
      modelUsed: model,
      recipe,
      result: recipe,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
