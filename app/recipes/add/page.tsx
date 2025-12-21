"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toStringArray } from "../../../../lib/ingredientMatch";
import { supabase } from "@/lib/supabaseClient";

function linesToArray(s: string): string[] {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function RecipeAddPage() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [serves, setServes] = useState("");
  const [prepMinutes, setPrepMinutes] = useState("");
  const [cookMinutes, setCookMinutes] = useState("");

  const [ingredientsText, setIngredientsText] = useState("");
  const [instructionsText, setInstructionsText] = useState("");
  const [notes, setNotes] = useState("");

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

    // guard against NaN
    if (payload.serves !== null && !Number.isFinite(payload.serves)) payload.serves = null;
    if (payload.prep_minutes !== null && !Number.isFinite(payload.prep_minutes)) payload.prep_minutes = null;
    if (payload.cook_minutes !== null && !Number.isFinite(payload.cook_minutes)) payload.cook_minutes = null;

    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.id) {
        throw new Error(json?.error || "Create failed");
      }

      // go to newly created recipe
      window.location.href = `/recipes/${json.id}`;
    } catch (e: any) {
      setError(e?.message || "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between gap-4">
          <Link href="/recipes" className="text-white/70 hover:text-white underline underline-offset-4">
            ← Back to Recipes
          </Link>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-60 px-5 py-2 text-sm font-semibold"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="mt-6 rounded-2xl bg-white/5 p-7 ring-1 ring-white/10">
          <h1 className="text-4xl font-extrabold tracking-tight">Add Recipe</h1>
          <p className="mt-2 text-white/60">
            One ingredient per line. One instruction per line. Simple, predictable, safe.
          </p>

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
                placeholder="Personal tips, substitutions, etc."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
