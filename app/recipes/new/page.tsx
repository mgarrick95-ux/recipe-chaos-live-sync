// app/recipes/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function NewRecipePage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [serves, setServes] = useState("");
  const [prepMinutes, setPrepMinutes] = useState("");
  const [cookMinutes, setCookMinutes] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [instructions, setInstructions] = useState("");
  const [notes, setNotes] = useState("");
  const [favorite, setFavorite] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg("Title is required.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        tags: tags.trim() || null,
        serves: serves.trim() ? Number(serves) : null,
        prep_minutes: prepMinutes.trim() ? Number(prepMinutes) : null,
        cook_minutes: cookMinutes.trim() ? Number(cookMinutes) : null,
        ingredients: ingredients.trim() || null,
        instructions: instructions.trim() || null,
        notes: notes.trim() || null,
        favorite,
      };

      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to save recipe");
      }

      // Back to main recipes list
      router.push("/recipes");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? "Failed to save recipe");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Link
          href="/recipes"
          className="mb-6 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-fuchsia-300"
        >
          <span>←</span>
          <span>Back to recipes</span>
        </Link>

        <h1 className="text-3xl font-bold mb-6">Add a recipe</h1>

        {errorMsg && (
          <div className="mb-4 rounded bg-red-800/80 px-4 py-2 text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold tracking-wide mb-1">
              Title *
            </label>
            <input
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-fuchsia-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold tracking-wide mb-1">
              Short description
            </label>
            <textarea
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-fuchsia-500 min-h-[60px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold tracking-wide mb-1">
              Tags (comma separated)
            </label>
            <input
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-fuchsia-500"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. pasta / italian, weeknight, freezer-friendly"
            />
          </div>

          {/* Serves, prep, cook */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold tracking-wide mb-1">
                Serves
              </label>
              <input
                type="number"
                min={0}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-fuchsia-500"
                value={serves}
                onChange={(e) => setServes(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-wide mb-1">
                Prep time (min)
              </label>
              <input
                type="number"
                min={0}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-fuchsia-500"
                value={prepMinutes}
                onChange={(e) => setPrepMinutes(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-wide mb-1">
                Cook time (min)
              </label>
              <input
                type="number"
                min={0}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-fuchsia-500"
                value={cookMinutes}
                onChange={(e) => setCookMinutes(e.target.value)}
              />
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <label className="block text-xs font-semibold tracking-wide mb-1">
              Ingredients (one per line)
            </label>
            <textarea
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-fuchsia-500 min-h-[150px]"
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              placeholder={"3 cups cooked shredded chicken\n1 jar pasta sauce\n2 cups shredded cheese"}
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-xs font-semibold tracking-wide mb-1">
              Method / steps (one step per line)
            </label>
            <textarea
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-fuchsia-500 min-h-[180px]"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={"Preheat oven to 375°F (190°C).\nMix chicken with sauce.\nLayer in pan with cheese and bake 25–30 minutes."}
            />
          </div>

          {/* Notes + favourite */}
          <div>
            <label className="block text-xs font-semibold tracking-wide mb-1">
              Notes (optional)
            </label>
            <textarea
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-fuchsia-500 min-h-[80px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Serving notes, kid variations, Ninja Combi settings, etc."
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="favorite"
              type="checkbox"
              className="h-4 w-4 rounded border-slate-700 bg-slate-900"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
            />
            <label htmlFor="favorite" className="text-xs text-gray-300">
              Mark as house favourite
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 text-sm font-semibold shadow shadow-fuchsia-500/40 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save recipe"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/recipes")}
              className="px-4 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
