import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import DeleteRecipeButton from "./DeleteRecipeButton";

type Recipe = {
  id: string;
  title: string;
  description?: string | null;
  source_url?: string | null;
  source_name?: string | null;
  favorite?: boolean | null;
  ingredients?: any;
  instructions?: any;
  steps?: any;
  source_text?: string | null;
};

type PageProps = {
  params: { id: string };
};

function hostFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function tryParseJsonArrayString(value: string): string[] | null {
  const s = value.trim();
  if (!s) return null;
  if (!(s.startsWith("[") && s.endsWith("]"))) return null;

  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed
        .map((v) => (typeof v === "string" ? v : String(v)))
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return null;
  } catch {
    return null;
  }
}

function toStringArrayBasic(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : String(v)))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [String(value)].map((s) => s.trim()).filter(Boolean);
}

function parseInstructions(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : String(v)))
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const raw = normalizeNewlines(value).trim();
    if (!raw) return [];

    const jsonArr = tryParseJsonArrayString(raw);
    if (jsonArr) return jsonArr;

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

  return toStringArrayBasic(value);
}

export default async function RecipeDetailPage({ params }: PageProps) {
  const { data: recipe, error } = await supabaseServer
    .from("recipes")
    .select(
      `
      id,
      title,
      description,
      source_url,
      source_name,
      favorite,
      ingredients,
      instructions,
      steps,
      source_text
    `
    )
    .eq("id", params.id)
    .single<Recipe>();

  if (error || !recipe) notFound();

  const sourceHost = recipe.source_url ? hostFromUrl(recipe.source_url) : null;
  const sourceLabel = recipe.source_name || sourceHost || "Source";

  const ingredients = toStringArrayBasic(recipe.ingredients);
  const instructions = parseInstructions(recipe.instructions ?? recipe.steps);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <Link href="/recipes" style={{ textDecoration: "none" }}>
        ← Back to Recipes
      </Link>

      <div
        style={{
          marginTop: 16,
          padding: 20,
          borderRadius: 16,
          background: "rgba(255,255,255,0.04)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 56, margin: 0, lineHeight: 1.05 }}>
              {recipe.title}
            </h1>

            {recipe.source_url && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 14, opacity: 0.78 }}>
                  Source:{" "}
                  <a
                    href={recipe.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: "underline" }}
                  >
                    {sourceLabel}
                  </a>
                </div>

                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.55 }}>
                  {recipe.source_url}
                </div>
              </div>
            )}

            {recipe.description && (
              <p style={{ marginTop: 12, opacity: 0.85 }}>
                {recipe.description}
              </p>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Link href={`/recipes/${recipe.id}/cook`}>
              <button
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.2)",
                  cursor: "pointer",
                }}
              >
                Cook
              </button>
            </Link>

            <Link href={`/recipes/${recipe.id}/edit`}>
              <button
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.2)",
                  cursor: "pointer",
                }}
              >
                Edit
              </button>
            </Link>

            <Link href={`/recipes/${recipe.id}/duplicate`}>
              <button
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.2)",
                  cursor: "pointer",
                }}
              >
                Duplicate
              </button>
            </Link>

            <DeleteRecipeButton recipeId={recipe.id} recipeTitle={recipe.title} />
          </div>
        </div>

        {/* Ingredients + Instructions */}
        <div
          style={{
            marginTop: 22,
            padding: 18,
            borderRadius: 16,
            background: "rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 28, margin: 0 }}>Ingredients</h2>
              {ingredients.length === 0 ? (
                <div style={{ marginTop: 10, opacity: 0.7 }}>No ingredients yet.</div>
              ) : (
                <ul style={{ marginTop: 12, paddingLeft: 18, lineHeight: 1.65 }}>
                  {ingredients.map((ing, idx) => (
                    <li key={`${ing}-${idx}`}>{ing}</li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h2 style={{ fontSize: 28, margin: 0 }}>Instructions</h2>
              {instructions.length === 0 ? (
                <div style={{ marginTop: 10, opacity: 0.7 }}>No instructions yet.</div>
              ) : (
                <ol style={{ marginTop: 12, paddingLeft: 18, lineHeight: 1.65 }}>
                  {instructions.map((step, idx) => (
                    <li key={`${step}-${idx}`} style={{ marginBottom: 10 }}>
                      {step}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>

        {/* Imported page text (Phase 3D) */}
        {recipe.source_text ? (
          <div
            style={{
              marginTop: 18,
              padding: 16,
              borderRadius: 16,
              border: "1px solid rgba(0,0,0,0.10)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <h3 style={{ margin: 0, marginBottom: 10 }}>Imported page text</h3>
            <div style={{ whiteSpace: "pre-wrap", opacity: 0.85, lineHeight: 1.55 }}>
              {recipe.source_text.slice(0, 5000)}
            </div>
            {recipe.source_text.length > 5000 ? (
              <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>
                Showing first 5,000 characters.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
