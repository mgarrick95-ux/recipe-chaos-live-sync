// app/recipes/page.tsx
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

import { generateSuggestedRecipes } from "@/lib/recipeSuggestions";
import PageHero from "@/components/ui/PageHero";
import AddRecipeInlineMenu from "@/components/ui/AddRecipeInlineMenu";

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
  ingredients_json?: any;
  ingredients_list?: any;
  ingredientsText?: any;
  ingredients_text?: any;

  instructions?: any;
  steps?: any;

  created_at?: string | null;
  updated_at?: string | null;
};

type SortMode = "newest" | "oldest" | "az" | "za";
type Tab = "mine" | "suggested";

function makeSeed() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// deterministic shuffle utilities
function hashStringToInt(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(arr: T[], seed: string): T[] {
  const out = [...arr];
  const rnd = mulberry32(hashStringToInt(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function extractIngredientsFromRecipe(r: Recipe): string[] {
  const candidates = [
    r.ingredients,
    (r as any).ingredients_json,
    (r as any).ingredients_list,
    (r as any).ingredientsText,
    (r as any).ingredients_text,
  ];
  for (const v of candidates) {
    const arr = toStringArray(v);
    if (arr.length > 0) return arr;
  }
  return [];
}

function extractInstructionsFromRecipe(r: Recipe): string[] {
  return toStringArray(r.instructions ?? r.steps);
}

/**
 * UI helper: build a tooltip string for close matches
 * (up to 3 pairs; quiet, informational)
 */
function buildCloseMatchTitle(details: Array<any>) {
  const soft = (details || []).filter((d) => d?.isSoftMatch && d?.matched);

  if (soft.length === 0) return "";

  const lines = soft.slice(0, 3).map((d) => {
    const ing = String(d?.ingredient ?? "").trim();
    const match = String(d?.matchedStorageRawName ?? "").trim();
    const kind = String(d?.matchKind ?? "").trim();

    if (!ing || !match) return "";
    const kindLabel = kind === "containment" || kind === "token" ? "similar" : kind || "similar";
    return `${ing} → ${match} (${kindLabel})`;
  });

  const shown = lines.filter(Boolean);
  if (shown.length === 0) return "";

  const remaining = soft.length - shown.length;
  return remaining > 0 ? `${shown.join("\n")}\n+${remaining} more` : shown.join("\n");
}

export default function RecipesPage() {
  const [tab, setTab] = useState<Tab>("mine");

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [recipesError, setRecipesError] = useState<string | null>(null);

  const [storage, setStorage] = useState<StorageItem[]>([]);
  const [loadingStorage, setLoadingStorage] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [noBuyOnly, setNoBuyOnly] = useState(false);

  const [sortMode, setSortMode] = useState<SortMode>("newest");

  // Suggested recipes preferences (local only for now)
  const [avoidRaw, setAvoidRaw] = useState<string>("");
  const [suggestedSeed, setSuggestedSeed] = useState<string>(() => makeSeed());

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("rc_avoid_ingredients") || "";
      setAvoidRaw(saved);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("rc_avoid_ingredients", avoidRaw);
    } catch {}
  }, [avoidRaw]);

  useEffect(() => {
    let alive = true;

    async function loadRecipes() {
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

    loadRecipes();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadStorage() {
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

    loadStorage();
    return () => {
      alive = false;
    };
  }, []);

  const storageIndex = useMemo(() => buildStorageIndex(storage), [storage]);

  const computed = useMemo(() => {
    const map = new Map<
      string,
      {
        tags: string[];
        ingredients: string[];
        instructions: string[];
        searchBlob: string;
        summary: {
          total: number;
          haveCount: number;
          missing: string[];
          allInStock: boolean;
          softHaveCount?: number;
          details?: Array<any>;
        };
      }
    >();

    for (const r of recipes) {
      const tags = toStringArray(r.tags);
      const ingredients = extractIngredientsFromRecipe(r);
      const instructions = extractInstructionsFromRecipe(r);

      const searchBlob = [
        r.title ?? "",
        r.description ?? "",
        tags.join(" "),
        ingredients.join(" "),
        instructions.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      let summary: any = {
        total: ingredients.length,
        haveCount: 0,
        missing: ingredients,
        allInStock: false,
        softHaveCount: 0,
        details: [],
      };

      if (!loadingStorage && !storageError && ingredients.length > 0) {
        summary = summarizeIngredients(ingredients, storageIndex) as any;
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
      const matchesFav = !favoritesOnly || Boolean(r.favorite);
      const matchesNoBuy = !noBuyOnly || Boolean(meta?.summary.allInStock);

      return matchesQuery && matchesFav && matchesNoBuy;
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
  }, [recipes, computed, query, favoritesOnly, noBuyOnly, sortMode]);

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
    setFavoritesOnly(false);
    setNoBuyOnly(false);
    setSortMode("newest");
  }

  const suggested = useMemo(() => {
    const base = generateSuggestedRecipes({
      recipes,
      avoidRaw,
      limit: 12,
    });

    return {
      preferredTags: base.preferredTags,
      suggestions: shuffleWithSeed(base.suggestions, suggestedSeed),
    };
  }, [recipes, avoidRaw, suggestedSeed]);

  const tabPill =
    "group relative inline-flex items-center gap-3 rounded-full bg-white/10 hover:bg-white/15 px-5 py-3 text-sm font-semibold ring-1 ring-white/10 transition";
  const tabPillActive =
    "group relative inline-flex items-center gap-3 rounded-full bg-[var(--rc-accent)] hover:bg-[var(--rc-accent-hover)] px-5 py-3 text-sm font-extrabold text-black ring-1 ring-white/10 transition shadow-[0_12px_30px_rgba(255,153,51,0.18)]";

  function goSaveSuggestion(s: any) {
    const title = String(s?.title ?? "").trim();
    const source_url = String(s?.source_url ?? "").trim();
    const source_name = String(s?.source_name ?? "").trim();

    if (source_url) {
      window.location.href = `/recipes/clip?url=${encodeURIComponent(source_url)}`;
      return;
    }

    const qp = new URLSearchParams();
    if (title) qp.set("title", title);
    if (source_url) qp.set("source_url", source_url);
    if (source_name) qp.set("source_name", source_name);

    window.location.href = qp.toString() ? `/recipes/add/manual?${qp.toString()}` : `/recipes/add/manual`;
  }

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <PageHero
        title="Recipes"
        subtitle="No rules. No pressure. Just food."
        action={
          <AddRecipeInlineMenu
            hrefTypeIt="/recipes/add/manual"
            hrefLink="/recipes/add/url"
            hrefPhoto="/recipes/add/photo"
          />
        }
        stickers={[
          { emoji: "📖", top: "16%", left: "74%", size: "66px", rotate: "10deg", opacity: "0.95" },
          { emoji: "🧄", top: "44%", left: "90%", size: "54px", rotate: "-12deg", opacity: "0.85" },
          { emoji: "🥕", top: "60%", left: "82%", size: "60px", rotate: "8deg", opacity: "0.9" },
        ]}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => setTab("mine")} className={tab === "mine" ? tabPillActive : tabPill}>
            <span className="text-lg">📚</span>
            <span className="flex flex-col items-start leading-tight">
              <span>My Recipes</span>
              <span
                className={
                  tab === "mine" ? "text-black/80 text-[11px] font-semibold" : "text-white/60 text-[11px] font-semibold"
                }
              >
                The usual suspects.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab("suggested")}
            className={tab === "suggested" ? tabPillActive : tabPill}
          >
            <span className="text-lg">✨</span>
            <span className="flex flex-col items-start leading-tight">
              <span className="flex items-center gap-2">
                Suggested{" "}
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white/80 ring-1 ring-white/10">
                  Coming soon
                </span>
              </span>
              <span
                className={
                  tab === "suggested"
                    ? "text-black/80 text-[11px] font-semibold"
                    : "text-white/60 text-[11px] font-semibold"
                }
              >
                Let me find you something.
              </span>
            </span>
          </button>
        </div>
      </PageHero>

      <div className="max-w-6xl mx-auto px-4 py-10">
        {tab === "mine" ? (
          <>
            {/* Controls */}
            <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex flex-col gap-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by ingredient, mood, or vague intention…"
                    className="w-[320px] max-w-full rounded-2xl bg-white/5 text-white placeholder:text-white/35 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-[rgba(34,211,238,0.45)]"
                  />
                  <div className="text-xs text-white/45">Searches titles, ingredients, and instructions. No judgment.</div>
                </div>

                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="w-[220px] max-w-full rounded-2xl bg-[#0b1026] text-white ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-[rgba(34,211,238,0.45)]"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="az">A → Z</option>
                  <option value="za">Z → A</option>
                </select>

                <button type="button" onClick={resetFilters} className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3" title="Reset filters">
                  Reset
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-start gap-6 text-white/80">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={favoritesOnly}
                    onChange={(e) => setFavoritesOnly(e.target.checked)}
                    className="h-4 w-4 accent-[var(--rc-accent-2)]"
                  />
                  Favorites only
                </label>

                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={noBuyOnly}
                      onChange={(e) => setNoBuyOnly(e.target.checked)}
                      disabled={loadingStorage || Boolean(storageError)}
                      className="h-4 w-4 accent-[var(--rc-accent)] disabled:opacity-50"
                    />
                    Use what you’ve got
                  </label>

                  {noBuyOnly && !loadingStorage && !storageError ? (
                    <div className="text-xs text-white/55 pl-6">Pantry’s got this.</div>
                  ) : null}

                  {storageError ? <div className="text-xs text-white/40 pl-6">(Needs Pantry &amp; Freezer loaded)</div> : null}
                </div>
              </div>
            </div>

            <div className="mt-8">
              {loadingRecipes ? (
                <div className="text-white/70">Loading…</div>
              ) : recipesError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-5 py-4 text-red-100">{recipesError}</div>
              ) : filtered.length === 0 ? (
                <div className="text-white/55">
                  <div className="font-semibold text-white/70">No matches.</div>
                  <div className="mt-1 text-sm text-white/50">Try fewer words or a different vibe.</div>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2">
                  {filtered.map((r) => {
                    const meta = computed.get(r.id);
                    const tags = meta?.tags ?? [];
                    const serves = r.serves ?? r.servings ?? null;

                    const summary: any = meta?.summary ?? {
                      total: 0,
                      haveCount: 0,
                      missing: [] as string[],
                      allInStock: false,
                      softHaveCount: 0,
                      details: [],
                    };

                    const showStorageBits = !loadingStorage && !storageError && summary.total > 0;

                    let inventoryClass = "text-white/70 font-normal";
                    let inventoryToneState: "good" | "some" | "low" = "low";

                    if (showStorageBits) {
                      const total = Math.max(0, Number(summary.total) || 0);
                      const have = Math.max(0, Number(summary.haveCount) || 0);
                      const coverage = total > 0 ? have / total : 0;

                      if (coverage >= 0.8) inventoryToneState = "good";
                      else if (coverage >= 0.3) inventoryToneState = "some";
                      else inventoryToneState = "low";

                      inventoryClass =
                        inventoryToneState === "good"
                          ? "text-emerald-400 font-semibold"
                          : inventoryToneState === "some"
                          ? "text-amber-300 font-normal"
                          : "text-orange-400 font-normal";
                    }

                    const softHaveCount = Math.max(0, Number(summary.softHaveCount) || 0);
                    const closeTitle = buildCloseMatchTitle(summary.details || []);

                    return (
                      <div key={r.id} className="relative rounded-3xl bg-white/5 p-7 ring-1 ring-white/10">
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

                          {showStorageBits ? (
                            <div className={`mt-4 text-sm ${inventoryClass}`}>
                              Have{" "}
                              <span className={inventoryToneState === "good" ? "font-semibold" : "font-medium"}>
                                {summary.haveCount}/{summary.total}
                              </span>{" "}
                              in Pantry &amp; Freezer
                              {softHaveCount > 0 ? (
                                <span
                                  className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/75 ring-1 ring-white/10"
                                  title={closeTitle || `${softHaveCount} similar match(es)`}
                                >
                                  ≈ Similar {softHaveCount}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </Link>

                        <div className="mt-6 flex items-center gap-3 flex-wrap">
                          <button
                            type="button"
                            onClick={() => (window.location.href = `/recipes/${r.id}/edit`)}
                            className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3"
                          >
                            Edit
                          </button>

                          <Link
                            href={`/recipes/${r.id}/cook`}
                            className="rounded-2xl bg-[var(--rc-accent-2)] hover:bg-[var(--rc-accent-2-hover)] px-5 py-3 font-extrabold text-black shadow-[0_12px_26px_rgba(34,211,238,0.18)]"
                          >
                            Cook it now
                          </Link>

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
          </>
        ) : (
          <>
            {/* Suggested tab (unchanged) */}
            <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight">
                    Suggested recipes{" "}
                    <span className="ml-2 align-middle rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white/80 ring-1 ring-white/10">
                      Coming soon
                    </span>
                  </h2>
                  <p className="mt-2 text-white/70">
                    Let me find you something. For now, this is a stub pool while we wire up the real version.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSuggestedSeed(makeSeed())}
                  className="rounded-full bg-white/10 hover:bg-white/15 px-5 py-3 font-semibold ring-1 ring-white/10"
                  title="Shuffle the suggestions"
                >
                  🔄 New batch
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
                  <div className="text-sm font-bold text-white/90">Never suggest (comma-separated)</div>
                  <div className="mt-2 text-xs text-white/60">Example: kale, chickpeas, capers, alfredo, sausage</div>

                  <input
                    value={avoidRaw}
                    onChange={(e) => setAvoidRaw(e.target.value)}
                    placeholder="kale, chickpeas, capers…"
                    className="mt-3 w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-[rgba(34,211,238,0.45)]"
                  />

                  <div className="mt-3 text-xs text-white/50">Saved locally.</div>
                </div>

                <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
                  <div className="text-sm font-bold text-white/90">What it’s learning right now</div>
                  <div className="mt-2 text-xs text-white/60">We rank suggestions using your recipe tags + favorites.</div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {suggested.preferredTags.length === 0 ? (
                      <span className="text-white/60 text-sm">Add some tags/favorites to improve recommendations.</span>
                    ) : (
                      suggested.preferredTags.map((t) => (
                        <span key={t} className="rounded-full bg-white/10 px-3 py-1 text-sm">
                          {t}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              {suggested.suggestions.map((s: any) => (
                <div key={s.id} className="rounded-3xl bg-white/5 p-7 ring-1 ring-white/10">
                  <div className="text-3xl font-extrabold tracking-tight">{s.title}</div>
                  {s.description ? <div className="mt-2 text-white/70">{s.description}</div> : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {(s.tags || []).slice(0, 4).map((t: string) => (
                      <span key={t} className="rounded-full bg-white/10 px-3 py-1 text-sm">
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 text-white/60 text-sm">
                    Ingredients (keywords):{" "}
                    <span className="text-white/75">{(s.ingredients || []).slice(0, 6).join(", ")}</span>
                  </div>

                  <div className="mt-6 flex items-center gap-3">
                    <button
                      type="button"
                      className="rounded-2xl bg-[var(--rc-accent)] hover:bg-[var(--rc-accent-hover)] px-5 py-3 font-extrabold text-black shadow-[0_12px_30px_rgba(255,153,51,0.18)]"
                      onClick={() => goSaveSuggestion(s)}
                    >
                      Save to Recipes
                    </button>

                    {s.source_url ? (
                      <a
                        href={s.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3"
                      >
                        View source
                      </a>
                    ) : (
                      <span className="text-xs text-white/40">No source URL</span>
                    )}
                  </div>

                  {s.source_name ? <div className="mt-3 text-xs text-white/40">Source: {s.source_name}</div> : null}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
