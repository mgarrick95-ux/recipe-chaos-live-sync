"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  toStringArray,
  buildStorageIndex,
  summarizeIngredients,
  parseStorageItems,
  parseRecipes,
  type StorageItem,
} from "../../lib/ingredientMatch";

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
  created_at?: string | null;
  updated_at?: string | null;
};

type SortMode = "newest" | "oldest" | "az" | "za";

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [recipesError, setRecipesError] = useState<string | null>(null);

  const [storage, setStorage] = useState<StorageItem[]>([]);
  const [loadingStorage, setLoadingStorage] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("__all__");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [noBuyOnly, setNoBuyOnly] = useState(false);

  // NEW quick filters
  const [hasIngredientsOnly, setHasIngredientsOnly] = useState(false);
  const [hasInstructionsOnly, setHasInstructionsOnly] = useState(false);

  const [sortMode, setSortMode] = useState<SortMode>("newest");

  // ---------- Load recipes ----------
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoadingRecipes(true);
        setRecipesError(null);

        const res = await fetch("/api/recipes", { cache: "no-store" });
        const json = await res.json().catch(() => null);

        if (!res.ok) throw new Error(json?.error || "Failed to load recipes");

        const list = parseRecipes(json);
        if (alive) setRecipes(list as Recipe[]);
      } catch (e: any) {
        if (alive) setRecipesError(e?.message || "Failed to load recipes");
      } finally {
        if (alive) setLoadingRecipes(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  // ---------- Load storage ----------
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoadingStorage(true);
        setStorageError(null);

        const res = await fetch("/api/storage-items", { cache: "no-store" });
        const json = await res.json().catch(() => null);

        if (!res.ok) throw new Error(json?.error || "Failed to load storage");

        const items = parseStorageItems(json);
        if (alive) setStorage(items as StorageItem[]);
      } catch (e: any) {
        if (alive) setStorageError(e?.message || "Failed to load storage");
      } finally {
        if (alive) setLoadingStorage(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  // ---------- Derived ----------
  const storageIndex = useMemo(() => buildStorageIndex(storage), [storage]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) {
      toStringArray(r.tags).forEach((t) => set.add(t));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [recipes]);

  // Precompute per-recipe arrays + storage summary for speed + consistency
  const computed = useMemo(() => {
    const map = new Map<
      string,
      {
        tags: string[];
        ingredients: string[];
        instructions: string[];
        searchBlob: string;
        summary: { total: number; haveCount: number; missing: string[]; allInStock: boolean };
      }
    >();

    for (const r of recipes) {
      const tags = toStringArray(r.tags);
      const ingredients = toStringArray(r.ingredients);
      const instructions = toStringArray(r.instructions ?? r.steps);

      const searchBlob = [
        r.title ?? "",
        r.description ?? "",
        tags.join(" "),
        ingredients.join(" "),
        instructions.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      let summary = {
        total: ingredients.length,
        haveCount: 0,
        missing: ingredients,
        allInStock: false,
      };

      if (!loadingStorage && !storageError && ingredients.length > 0) {
        summary = summarizeIngredients(ingredients, storageIndex);
      }

      map.set(r.id, { tags, ingredients, instructions, searchBlob, summary });
    }

    return map;
  }, [recipes, loadingStorage, storageError, storageIndex]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    let list = recipes.filter((r) => {
      const meta = computed.get(r.id);

      const matchesQuery = !q || Boolean(meta?.searchBlob.includes(q));

      const matchesTag = tagFilter === "__all__" || meta?.tags.includes(tagFilter);

      const matchesFav = !favoritesOnly || Boolean(r.favorite);

      const matchesNoBuy = !noBuyOnly || Boolean(meta?.summary.allInStock);

      const matchesHasIngredients = !hasIngredientsOnly || (meta?.ingredients.length ?? 0) > 0;

      const matchesHasInstructions = !hasInstructionsOnly || (meta?.instructions.length ?? 0) > 0;

      return (
        matchesQuery &&
        matchesTag &&
        matchesFav &&
        matchesNoBuy &&
        matchesHasIngredients &&
        matchesHasInstructions
      );
    });

    list = [...list].sort((a, b) => {
      if (sortMode === "az") return (a.title || "").localeCompare(b.title || "");
      if (sortMode === "za") return (b.title || "").localeCompare(a.title || "");

      const ad = new Date(a.updated_at || a.created_at || 0).getTime();
      const bd = new Date(b.updated_at || b.created_at || 0).getTime();
      if (sortMode === "oldest") return ad - bd;
      return bd - ad;
    });

    return list;
  }, [
    recipes,
    computed,
    query,
    tagFilter,
    favoritesOnly,
    noBuyOnly,
    hasIngredientsOnly,
    hasInstructionsOnly,
    sortMode,
  ]);

  // ---------- Actions ----------
  async function toggleFavorite(recipe: Recipe) {
    const prev = Boolean(recipe.favorite);

    setRecipes((all) => all.map((r) => (r.id === recipe.id ? { ...r, favorite: !prev } : r)));

    const res = await fetch(`/api/recipes/${recipe.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: !prev }),
    });

    if (!res.ok) {
      setRecipes((all) => all.map((r) => (r.id === recipe.id ? { ...r, favorite: prev } : r)));
      alert("Could not update favorite.");
    }
  }

  async function deleteRecipe(recipe: Recipe) {
    const ok = confirm(`Delete "${recipe.title}"?`);
    if (!ok) return;

    const res = await fetch(`/api/recipes/${recipe.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Delete failed.");
      return;
    }

    setRecipes((all) => all.filter((r) => r.id !== recipe.id));
  }

  function resetFilters() {
    setQuery("");
    setTagFilter("__all__");
    setFavoritesOnly(false);
    setNoBuyOnly(false);
    setHasIngredientsOnly(false);
    setHasInstructionsOnly(false);
    setSortMode("newest");
  }

  const storageStatusText = useMemo(() => {
    if (loadingStorage) return "loading storage…";
    if (storageError) return `unavailable (${storageError})`;
    return "open storage";
  }, [loadingStorage, storageError]);

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-6xl font-extrabold tracking-tight">Your Recipes</h1>
            <p className="mt-3 text-white/70">A cozy little vault for the meals your house actually likes.</p>

            <div className="mt-2 text-white/50 text-sm">
              FrostPantry link:{" "}
              <Link href="/frostpantry" className="underline underline-offset-4 text-white/70 hover:text-white">
                {storageStatusText}
              </Link>
              {!loadingStorage && !storageError ? (
                <span className="text-white/40"> • loaded {storage.length} items</span>
              ) : null}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Link
              href="/recipes/clip"
              className="rounded-full bg-white/10 hover:bg-white/15 px-6 py-3 font-semibold ring-1 ring-white/10"
              title="Save a recipe link (Web Clip)"
            >
              Save from URL
            </Link>

            <Link
              href="/recipes/add"
              className="rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 px-6 py-3 font-semibold shadow-lg shadow-fuchsia-500/20"
            >
              + Add recipe
            </Link>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-8 rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
          <div className="flex flex-wrap items-center gap-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, tags, ingredients…"
              className="w-[280px] rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
            />

            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="w-[220px] rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
            >
              <option value="__all__">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="w-[220px] rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>

            <button
              type="button"
              onClick={resetFilters}
              className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3"
            >
              Reset
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-5 text-white/80">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(e) => setFavoritesOnly(e.target.checked)}
                className="h-4 w-4 accent-fuchsia-500"
              />
              Favorites only
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={noBuyOnly}
                onChange={(e) => setNoBuyOnly(e.target.checked)}
                disabled={loadingStorage || Boolean(storageError)}
                className="h-4 w-4 accent-fuchsia-500 disabled:opacity-50"
              />
              No-buy only
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={hasIngredientsOnly}
                onChange={(e) => setHasIngredientsOnly(e.target.checked)}
                className="h-4 w-4 accent-fuchsia-500"
              />
              Has ingredients
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={hasInstructionsOnly}
                onChange={(e) => setHasInstructionsOnly(e.target.checked)}
                className="h-4 w-4 accent-fuchsia-500"
              />
              Has instructions
            </label>

            {storageError ? <span className="text-xs text-white/40">(No-buy needs storage)</span> : null}
          </div>
        </div>

        {/* Body */}
        <div className="mt-8">
          {loadingRecipes ? (
            <div className="text-white/70">Loading…</div>
          ) : recipesError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-5 py-4 text-red-100">
              {recipesError}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-white/50">No matches. Try clearing filters.</div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              {filtered.map((r) => {
                const meta = computed.get(r.id);
                const tags = meta?.tags ?? [];
                const serves = r.serves ?? r.servings ?? null;

                const summary = meta?.summary ?? {
                  total: 0,
                  haveCount: 0,
                  missing: [] as string[],
                  allInStock: false,
                };

                const showStorageBits = !loadingStorage && !storageError && summary.total > 0;

                return (
                  <div key={r.id} className="relative rounded-3xl bg-white/5 p-7 ring-1 ring-white/10">
                    {/* Favorite star */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFavorite(r);
                      }}
                      className="absolute right-6 top-6 text-2xl leading-none"
                      title={r.favorite ? "Unfavorite" : "Favorite"}
                      aria-label={r.favorite ? "Unfavorite" : "Favorite"}
                    >
                      {r.favorite ? "⭐" : "☆"}
                    </button>

                    <Link href={`/recipes/${r.id}`} className="block">
                      <h2 className="text-4xl font-extrabold tracking-tight pr-10">{r.title}</h2>
                      {r.description ? <p className="mt-2 text-white/70 line-clamp-2">{r.description}</p> : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {serves != null ? (
                          <span className="rounded-full bg-white/10 px-3 py-1 text-sm">Serves {serves}</span>
                        ) : null}
                        {r.prep_minutes != null ? (
                          <span className="rounded-full bg-white/10 px-3 py-1 text-sm">Prep {r.prep_minutes}m</span>
                        ) : null}
                        {r.cook_minutes != null ? (
                          <span className="rounded-full bg-white/10 px-3 py-1 text-sm">Cook {r.cook_minutes}m</span>
                        ) : null}
                        {tags.slice(0, 3).map((t) => (
                          <span key={t} className="rounded-full bg-white/10 px-3 py-1 text-sm">
                            {t}
                          </span>
                        ))}
                      </div>

                      {/* Storage summary */}
                      {showStorageBits ? (
                        <div className="mt-4 text-white/70">
                          Have <span className="text-white">{summary.haveCount}</span>/
                          <span className="text-white">{summary.total}</span> in storage
                        </div>
                      ) : null}

                      {showStorageBits && summary.missing.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {summary.missing.slice(0, 2).map((m) => (
                            <span key={m} className="rounded-full bg-red-500/15 text-red-200 px-3 py-1 text-sm">
                              missing: {m}
                            </span>
                          ))}
                          {summary.missing.length > 2 ? (
                            <span className="rounded-full bg-white/10 px-3 py-1 text-sm">
                              +{summary.missing.length - 2} more
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {showStorageBits && summary.missing.length === 0 ? (
                        <div className="mt-3 text-emerald-300 flex items-center gap-2">
                          <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-emerald-500/20 ring-1 ring-emerald-400/30">
                            ✓
                          </span>
                          No-buy ready (have {summary.total}/{summary.total})
                        </div>
                      ) : null}
                    </Link>

                    {/* Actions */}
                    <div className="mt-6 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => (window.location.href = `/recipes/${r.id}/edit`)}
                        className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRecipe(r)}
                        className="rounded-2xl bg-red-600 hover:bg-red-500 px-5 py-3"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
