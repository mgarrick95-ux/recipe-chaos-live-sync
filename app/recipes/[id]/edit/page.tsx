"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toStringArray } from "../../../../lib/ingredientMatch";
import { supabase } from "@/lib/supabaseClient";

type Recipe = {
  id: string;
  title: string;
  description?: string | null;
  tags?: string[] | string | null;
  favorite?: boolean | null;
  serves?: number | null;
  servings?: number | null;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  ingredients?: any;
  instructions?: any;
  steps?: any;
  notes?: string | null;
};

function linesToArray(s: string): string[] {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function arrayToLines(arr: string[]): string {
  return (arr ?? []).join("\n");
}

export default function RecipeEditPage({ params }: { params: { id: string } }) {
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [original, setOriginal] = useState<Recipe | null>(null);

  // form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState(""); // comma separated
  const [serves, setServes] = useState<string>(""); // keep as string for input
  const [prepMinutes, setPrepMinutes] = useState<string>("");
  const [cookMinutes, setCookMinutes] = useState<string>("");

  const [ingredientsText, setIngredientsText] = useState(""); // one per line
  const [instructionsText, setInstructionsText] = useState(""); // one per line
  const [notes, setNotes] = useState("");

  // Load recipe
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/recipes/${id}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);

        if (!res.ok) throw new Error(json?.error || "Failed to load recipe");

        if (!alive) return;

        const r: Recipe = json;
        setOriginal(r);

        setTitle(r.title ?? "");
        setDescription(r.description ?? "");

        const tagsArr = toStringArray(r.tags);
        setTagsText(tagsArr.join(", "));

        const s = (r.serves ?? r.servings ?? "") as any;
        setServes(s === null || s === undefined ? "" : String(s));

        setPrepMinutes(r.prep_minutes == null ? "" : String(r.prep_minutes));
        setCookMinutes(r.cook_minutes == null ? "" : String(r.cook_minutes));

        const ingredientsArr = toStringArray(r.ingredients);
        setIngredientsText(arrayToLines(ingredientsArr));

        const instructionsArr = toStringArray(r.instructions ?? r.steps);
        setInstructionsText(arrayToLines(instructionsArr));

        setNotes(r.notes ?? "");
      } catch (e: any) {
        if (alive) setError(e?.message || "Failed to load recipe");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [id]);

  const isDirty = useMemo(() => {
    if (!original) return false;

    const oTags = toStringArray(original.tags).join(", ");
    const oIngredients = arrayToLines(toStringArray(original.ingredients));
    const oInstructions = arrayToLines(toStringArray(original.instructions ?? original.steps));

    const oServes = original.serves ?? original.servings ?? "";
    const oPrep = original.prep_minutes ?? "";
    const oCook = original.cook_minutes ?? "";

    return (
      (original.title ?? "") !== title ||
      (original.description ?? "") !== description ||
      oTags !== tagsText ||
      String(oServes ?? "") !== String(serves ?? "") ||
      String(oPrep ?? "") !== String(prepMinutes ?? "") ||
      String(oCook ?? "") !== String(cookMinutes ?? "") ||
      oIngredients !== ingredientsText ||
      oInstructions !== instructionsText ||
      (original.notes ?? "") !== notes
    );
  }, [
    original,
    title,
    description,
    tagsText,
    serves,
    prepMinutes,
    cookMinutes,
    ingredientsText,
    instructionsText,
    notes,
  ]);

  async function save() {
    if (!title.trim()) {
      alert("Title is required.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload: any = {
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      tags: tagsText
        ? tagsText
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
      serves: serves.trim() ? Number(serves) : null,
      prep_minutes: prepMinutes.trim() ? Number(prepMinutes) : null,
      cook_minutes: cookMinutes.trim() ? Number(cookMinutes) : null,
      ingredients: linesToArray(ingredientsText),
      instructions: linesToArray(instructionsText),
      notes: notes.trim() ? notes.trim() : null,
    };

    // Avoid NaN going to the API
    if (payload.serves !== null && !Number.isFinite(payload.serves)) payload.serves = null;
    if (payload.prep_minutes !== null && !Number.isFinite(payload.prep_minutes)) payload.prep_minutes = null;
    if (payload.cook_minutes !== null && !Number.isFinite(payload.cook_minutes)) payload.cook_minutes = null;

    try {
      // Prefer PUT (full update). If your route only supports PATCH, we fallback.
      let res = await fetch(`/api/recipes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 405) {
        res = await fetch(`/api/recipes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json().catch(() => null);

      if (!res.ok) throw new Error(json?.error || "Save failed");

      // go back to detail view
      window.location.href = `/recipes/${id}`;
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (!isDirty || confirm("Discard changes?")) {
      window.location.href = `/recipes/${id}`;
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-[#050816] text-white p-10">Loading…</div>;
  }

  if (error && !original) {
    return (
      <div className="min-h-screen bg-[#050816] text-white p-10">
        <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-5 py-4 text-red-100">
          {error}
        </div>
        <div className="mt-6">
          <Link href="/recipes" className="underline underline-offset-4 text-white/80 hover:text-white">
            ← Back to Recipes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between gap-4">
          <Link href={`/recipes/${id}`} className="text-white/70 hover:text-white underline underline-offset-4">
            ← Back
          </Link>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={cancel}
              className="rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-60 px-5 py-2 text-sm font-semibold"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white/5 p-7 ring-1 ring-white/10">
          <h1 className="text-4xl font-extrabold tracking-tight">Edit Recipe</h1>
          <p className="mt-2 text-white/60">Keep it simple: one ingredient per line, one step per line.</p>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-500/30 bg-red-950/40 px-5 py-4 text-red-100">
              {error}
            </div>
          ) : null}

          <div className="mt-8 grid gap-6">
            {/* Title */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                placeholder="e.g., Lasagna"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                placeholder="Optional short note"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Tags (comma separated)</label>
              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                placeholder="Pasta, Comfort, Weeknight"
              />
            </div>

            {/* Serves / Prep / Cook */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm text-white/70 mb-2">Serves</label>
                <input
                  value={serves}
                  onChange={(e) => setServes(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                  placeholder="e.g., 4"
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-2">Prep (minutes)</label>
                <input
                  value={prepMinutes}
                  onChange={(e) => setPrepMinutes(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                  placeholder="e.g., 15"
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-2">Cook (minutes)</label>
                <input
                  value={cookMinutes}
                  onChange={(e) => setCookMinutes(e.target.value)}
                  inputMode="numeric"
                  className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                  placeholder="e.g., 45"
                />
              </div>
            </div>

            {/* Ingredients */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Ingredients (one per line)</label>
              <textarea
                value={ingredientsText}
                onChange={(e) => setIngredientsText(e.target.value)}
                rows={10}
                className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                placeholder={`Ground beef\nNoodles\nTomato sauce`}
              />
            </div>

            {/* Instructions */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Instructions (one per line)</label>
              <textarea
                value={instructionsText}
                onChange={(e) => setInstructionsText(e.target.value)}
                rows={10}
                className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                placeholder={`Boil noodles\nCook meat sauce\nCombine and bake`}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm text-white/70 mb-2">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
                placeholder="Any personal tips, substitutions, etc."
              />
            </div>

            <div className="flex items-center justify-between text-white/50 text-sm">
              <span>{isDirty ? "Unsaved changes" : "All changes saved (or no changes yet)"}</span>
              <span>Recipe ID: {id}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
