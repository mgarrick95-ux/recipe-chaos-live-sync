// lib/openaiServer.ts
import OpenAI from "openai";

export type AIModelKind = "fast" | "smart" | "heavy";

export function getModel(kind: AIModelKind = "fast") {
  const fast = process.env.OPENAI_MODEL_FAST;
  const smart = process.env.OPENAI_MODEL_SMART;
  const heavy = process.env.OPENAI_MODEL_HEAVY;

  if (kind === "heavy") return heavy || "gpt-5.2";
  if (kind === "smart") return smart || "gpt-4.1";
  return fast || "gpt-4.1-mini";
}

export function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is missing");
  return new OpenAI({ apiKey: key });
}
