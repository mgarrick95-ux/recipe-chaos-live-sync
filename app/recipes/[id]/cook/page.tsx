// app/recipes/[id]/cook/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import CookClient from "./CookClient";

type Recipe = {
  id: string;
  title: string;
  source_url?: string | null;
  source_name?: string | null;
  ingredients?: any;
  instructions?: any;
  steps?: any;
};

type PageProps = { params: { id: string } };

function toStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : String(v)))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [String(value)].map((s) => s.trim()).filter(Boolean);
}

function tryParseJsonArrayString(value: string): string[] | null {
  const s = value.trim();
  if (!s) return null;
  if (!(s.startsWith("[") && s.endsWith("]"))) return null;
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((v) => (typeof v === "string" ? v : String(v)))
      .map((x) => x.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function parseInstructions(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return toStringArray(value);

  if (typeof value === "string") {
    const raw = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!raw) return [];

    const jsonArr = tryParseJsonArrayString(raw);
    if (jsonArr) return jsonArr;

    // prefer paragraphs (blank-line separated)
    if (/\n\s*\n/.test(raw)) {
      return raw
        .split(/\n\s*\n+/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter(Boolean);
    }

    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  return toStringArray(value);
}

export default async function CookPage({ params }: PageProps) {
  const { data: recipe, error } = await supabaseServer
    .from("recipes")
    .select("id,title,source_url,source_name,ingredients,instructions,steps")
    .eq("id", params.id)
    .single<Recipe>();

  if (error || !recipe) notFound();

  const ingredients = toStringArray(recipe.ingredients);
  const steps = parseInstructions(recipe.instructions ?? recipe.steps);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <Link href={`/recipes/${recipe.id}`} style={{ textDecoration: "none" }}>
          ← Back to Recipe
        </Link>
        <Link href="/meal-planning" style={{ textDecoration: "none" }}>
          ↗ Meal Planning
        </Link>
      </div>

      <h1 style={{ fontSize: 42, margin: "14px 0 6px 0", lineHeight: 1.1 }}>
        {recipe.title}
      </h1>

      <div style={{ opacity: 0.75, marginBottom: 14 }}>
        Cook Mode — ingredients checklist + step-by-step.
      </div>

      <CookClient ingredients={ingredients} steps={steps} />
    </div>
  );
}
