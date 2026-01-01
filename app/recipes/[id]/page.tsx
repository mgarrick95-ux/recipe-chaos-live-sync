// app/recipes/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import DeleteRecipeButton from "./DeleteRecipeButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Recipe = {
  id: string;
  title: string;
  description?: string | null;
  source_url?: string | null;
  source_name?: string | null;
  favorite?: boolean | null;
  tags?: string[] | string | null;
  serves?: number | null;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
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
    return normalizeNewlines(value)
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

const pill =
  "inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/15 px-6 py-3 font-semibold ring-1 ring-white/10 transition";
const pillPrimary =
  "inline-flex items-center justify-center rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 px-6 py-3 font-semibold text-white shadow-lg shadow-fuchsia-500/20 transition";

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
      tags,
      serves,
      prep_minutes,
      cook_minutes,
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
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link href="/recipes" className={pill}>
            ← Back to Recipes
          </Link>

          <div className="flex items-center gap-3 flex-wrap">
            <Link href={`/recipes/${recipe.id}/cook`} className={pill}>
              Cook
            </Link>
            <Link href={`/recipes/${recipe.id}/edit`} className={pillPrimary}>
              Edit
            </Link>

            {/* Duplicate removed (not needed / not working) */}

            <DeleteRecipeButton recipeId={recipe.id} recipeTitle={recipe.title} />
          </div>
        </div>

        {/* Main card */}
        <div className="mt-6 rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-6xl font-extrabold tracking-tight leading-[1.05]">{recipe.title}</h1>

              {recipe.serves || recipe.prep_minutes || recipe.cook_minutes ? (
                <div className="mt-3 text-sm text-white/70 flex flex-wrap gap-x-4 gap-y-1">
                  {recipe.serves ? <span>Serves: {recipe.serves}</span> : null}
                  {recipe.prep_minutes ? <span>Prep: {recipe.prep_minutes}m</span> : null}
                  {recipe.cook_minutes ? <span>Cook: {recipe.cook_minutes}m</span> : null}
                </div>
              ) : null}

              {recipe.source_url ? (
                <div className="mt-4">
                  <div className="text-sm text-white/70">
                    Source:{" "}
                    <a
                      href={recipe.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4 text-white hover:text-white/90"
                    >
                      {sourceLabel}
                    </a>
                  </div>
                  <div className="mt-1 text-xs text-white/40 break-all">{recipe.source_url}</div>
                </div>
              ) : null}

              {recipe.description ? <p className="mt-4 text-white/80">{recipe.description}</p> : null}
            </div>
          </div>

          {/* Ingredients + Instructions */}
          <div className="mt-6 rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight">Ingredients</h2>
                {ingredients.length === 0 ? (
                  <div className="mt-3 text-white/60">No ingredients yet.</div>
                ) : (
                  <ul className="mt-4 list-disc pl-5 leading-relaxed text-white/85">
                    {ingredients.map((ing, idx) => (
                      <li key={`${ing}-${idx}`}>{ing}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h2 className="text-3xl font-extrabold tracking-tight">Instructions</h2>
                {instructions.length === 0 ? (
                  <div className="mt-3 text-white/60">No instructions yet.</div>
                ) : (
                  <ol className="mt-4 list-decimal pl-5 leading-relaxed text-white/85">
                    {instructions.map((step, idx) => (
                      <li key={`${step}-${idx}`} className="mb-3">
                        {step}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>

          {/* Imported page text (optional) */}
          {recipe.source_text ? (
            <div className="mt-6 rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
              <h3 className="text-xl font-extrabold tracking-tight">Imported page text</h3>
              <div className="mt-3 whitespace-pre-wrap text-white/80 leading-relaxed">{recipe.source_text.slice(0, 5000)}</div>
              {recipe.source_text.length > 5000 ? (
                <div className="mt-3 text-xs text-white/50">Showing first 5,000 characters.</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
