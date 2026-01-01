// app/api/ai/ping/route.ts
import { NextResponse } from "next/server";
import { getOpenAIClient, getModel } from "@/lib/openaiServer";

export async function GET() {
  try {
    const client = getOpenAIClient();

    // use "fast" for pings so it stays cheap
    const response = await client.responses.create({
      model: getModel("fast"),
      input: "Say 'PONG' and nothing else.",
    });

    const text = (response.output_text || "").trim();

    return NextResponse.json({
      ok: true,
      result: text || "PONG",
      modelUsed: getModel("fast"),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
