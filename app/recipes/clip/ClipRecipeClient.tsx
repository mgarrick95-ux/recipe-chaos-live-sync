"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ReviewState = "imported" | "cleaned" | "inferred" | "missing";

type PreviewData = {
  title: string;
  description?: string | null;
  ingredients: string[];
  instructions: string[];
  source_url: string;
  source_name?: string | null;
  source_text?: string | null;
  review?: {
    title: ReviewState;
    description: ReviewState;
    ingredients: ReviewState;
    instructions: ReviewState;
  };
  warnings?: string[];
    notes?: string[];
  blocked?: boolean;
};

function toMultiline(arr: string[]): string {
  return (arr || []).filter(Boolean).join("\n");
}

function fromMultiline(s: string): string[] {
  return (s || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function cleanTitle(input: string): string {
  let s = (input || "").trim();

  s = s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");

  s = s.replace(/[!?.]{3,}$/g, "!!");

  const parts = s.split(/\s[|"-]\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const left = parts[0];
    if (left.length >= 8) s = left;
  }

  s = s.trim();
  if (s.length > 120) s = s.slice(0, 120).trim();

  return s || "Clipped recipe";
}

function reviewLabel(state?: ReviewState): string {
  if (state === "cleaned") return "Cleaned";
  if (state === "inferred") return "Needs review";
  if (state === "missing") return "Missing";
  return "Imported";
}

function reviewClass(state?: ReviewState): string {
  if (state === "cleaned") {
    return "bg-cyan-400/15 text-cyan-100 ring-cyan-300/20";
  }
  if (state === "inferred") {
    return "bg-amber-400/15 text-amber-100 ring-amber-300/20";
  }
  if (state === "missing") {
    return "bg-red-400/15 text-red-100 ring-red-300/20";
  }
  return "bg-emerald-400/15 text-emerald-100 ring-emerald-300/20";
}

function ReviewBadge({ state }: { state?: ReviewState }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ring-1 ${reviewClass(
        state
      )}`}
    >
      {reviewLabel(state)}
    </span>
  );
}

export default function SaveFromUrlPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewData | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [instructionsText, setInstructionsText] = useState("");

  const incomingUrl = (searchParams?.get("url") || "").trim();
  const [didAutoPreview, setDidAutoPreview] = useState(false);

  useEffect(() => {
    if (!incomingUrl) return;
    setUrl((prev) => (prev.trim() ? prev : incomingUrl));
  }, [incomingUrl]);

  const canPreview = url.trim().length > 0;

  const previewIngredients = useMemo(
    () => fromMultiline(ingredientsText),
    [ingredientsText]
  );

  const previewInstructions = useMemo(() => {
    const lines = fromMultiline(instructionsText);
    if (lines.length > 0) return lines;

    return (instructionsText || "")
      .split(/\n\s*\n+/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }, [instructionsText]);

  async function runPreview() {
    const u = url.trim();
    if (!u) return;

    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/recipes/url-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Couldn't preview that link.");

      const data = json as PreviewData;

      setPreview(data);
      setTitle(cleanTitle(data.title || ""));
      setDescription((data.description || "").trim());
      setIngredientsText(toMultiline(data.ingredients || []));
      setInstructionsText(toMultiline(data.instructions || []));

      if (data.blocked) {
        setErr(null);
      }
    } catch (e: any) {
      setErr(e?.message || "Preview failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!incomingUrl) return;
    if (didAutoPreview) return;
    if (!url.trim()) return;

    setDidAutoPreview(true);
    runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingUrl, url, didAutoPreview]);

  function resetAll() {
    setUrl("");
    setPreview(null);
    setTitle("");
    setDescription("");
    setIngredientsText("");
    setInstructionsText("");
    setErr(null);
    setDidAutoPreview(false);
  }

  async function saveRecipe() {
    setLoading(true);
    setErr(null);

    try {
      const payload = {
        title: cleanTitle(title.trim() || preview?.title || "Clipped recipe"),
        description: description.trim() || null,
        ingredients: fromMultiline(ingredientsText),
        instructions: previewInstructions,
        source_url: preview?.source_url || url.trim() || null,
        source_name: preview?.source_name || null,
        source_text: preview?.source_text || null,
      };

      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Save failed.");

      const id = json?.id || json?.data?.id;
      if (!id) throw new Error("Saved, but no recipe id returned.");

      router.push(`/recipes/${id}`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Save failed.");
    } finally {
      setLoading(false);
    }
  }

  const pill =
    "inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/15 px-6 py-3 font-semibold ring-1 ring-white/10 transition";
  const pillPrimary =
    "inline-flex items-center gap-2 rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 px-6 py-3 font-semibold text-white shadow-lg shadow-fuchsia-500/20 transition";
  const card = "rounded-3xl bg-white/5 ring-1 ring-white/10 p-6";

  const saveDisabled = loading || (!title.trim() && !preview);

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -left-40 h-[420px] w-[420px] rounded-full bg-fuchsia-500/15 blur-3xl" />
          <div className="absolute -bottom-48 -right-40 h-[520px] w-[520px] rounded-full bg-cyan-400/10 blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 pt-10 pb-7">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-6xl font-extrabold tracking-tight">
                Clip a recipe{" "}
                <span className="inline-block align-middle ml-2 h-3 w-3 rounded-full bg-fuchsia-400 shadow-[0_0_30px_rgba(232,121,249,0.35)]" />
              </h1>
              <p className="mt-3 text-white/75 text-lg">
                Paste a link. I&apos;ll do my best, then let you review it before saving.
              </p>
              <div className="mt-2 text-white/45 text-sm">
                Imported where possible. Cleaned where safe. Flagged when it needs human eyes.
              </div>
            </div>

            <Link href="/recipes" className={pill}>
              ← Back to recipes
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className={card}>
          <div className="text-sm font-bold text-white/90">Recipe URL</div>

          <div className="mt-3 flex gap-3 flex-wrap">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.allrecipes.com/recipe/..."
              className="flex-1 min-w-[320px] rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none text-white placeholder:text-white/40 focus:ring-2 focus:ring-fuchsia-400/50"
            />

            <button
              type="button"
              onClick={runPreview}
              disabled={!canPreview || loading}
              className={`${pillPrimary} ${!canPreview || loading ? "opacity-50 cursor-not-allowed" : ""}`}
              title={!canPreview ? "Paste a link first" : "Preview this link"}
            >
              {loading ? "Fetching..." : "Fetch it"}
            </button>

            <button
              type="button"
              onClick={resetAll}
              disabled={loading}
              className={`${pill} ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
              title="Reset everything"
            >
              Reset
            </button>
          </div>

          {err ? (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/40 px-5 py-4 text-red-100">
              {err}
            </div>
          ) : null}

          {!preview && !err ? (
            <div className="mt-4 text-sm text-white/60">
              Tip: recipe sites usually work best. If a site blocks import, you can still save the link and fill in the recipe manually.
            </div>
          ) : null}
        </div>

        {preview ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-bold text-white/90">Title</div>
                <ReviewBadge state={preview.review?.title} />
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-bold text-white/90">Ingredients</div>
                <ReviewBadge state={preview.review?.ingredients} />
              </div>
            </div>

            <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-bold text-white/90">Instructions</div>
                <ReviewBadge state={preview.review?.instructions} />
              </div>
            </div>
          </div>
        ) : null}

        {preview?.warnings?.length ? (
          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5 text-amber-50">
            <div className="font-bold">Needs attention</div>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-amber-100/90">
              {preview.warnings.map((warning, idx) => (
                <li key={`${warning}-${idx}`}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {preview?.notes?.length ? (
          <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-5 text-cyan-50">
            <div className="font-bold">Import notes</div>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-cyan-100/90">
              {preview.notes.map((note, idx) => (
                <li key={`${note}-${idx}`}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {preview?.blocked ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5 text-white/85">
            <div className="font-bold">Automatic import was blocked</div>
            <div className="mt-2 text-sm text-white/65">
              The link is still attached. You can paste ingredients and steps manually, then approve and save.
            </div>
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className={card}>
            <h2 className="text-2xl font-extrabold tracking-tight">What you&apos;ll save</h2>
            <p className="mt-2 text-white/70 text-sm">
              Edit anything. Delete anything. Approve only what looks right.
            </p>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block font-bold text-white/90">Title</label>
                <ReviewBadge state={preview?.review?.title} />
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give it a name you&apos;ll recognize later"
                className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none text-white placeholder:text-white/40 focus:ring-2 focus:ring-fuchsia-400/50"
              />
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block font-bold text-white/90">Description (optional)</label>
                <ReviewBadge state={preview?.review?.description} />
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional: one-liner, vibe, or warning label"
                className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none text-white placeholder:text-white/40 focus:ring-2 focus:ring-fuchsia-400/50 resize-y"
              />
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block font-bold text-white/90">Ingredients</label>
                <ReviewBadge state={preview?.review?.ingredients} />
              </div>
              <textarea
                value={ingredientsText}
                onChange={(e) => setIngredientsText(e.target.value)}
                rows={10}
                placeholder="One per line is happiest."
                className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none text-white placeholder:text-white/40 focus:ring-2 focus:ring-fuchsia-400/50 resize-y"
              />
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block font-bold text-white/90">Instructions / Steps</label>
                <ReviewBadge state={preview?.review?.instructions} />
              </div>
              <textarea
                value={instructionsText}
                onChange={(e) => setInstructionsText(e.target.value)}
                rows={10}
                placeholder="Steps, notes, or chaos. We&apos;ll format it."
                className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none text-white placeholder:text-white/40 focus:ring-2 focus:ring-fuchsia-400/50 resize-y"
              />
              <div className="mt-2 text-xs text-white/50">
                Tip: blank lines become separate steps. Or just paste and clean up only what matters.
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={saveRecipe}
                disabled={saveDisabled}
                className={`${pillPrimary} ${saveDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                title={saveDisabled ? "Preview or type a title first" : "Save this recipe"}
              >
                {loading ? "Saving..." : "Approve and save"}
              </button>

              <Link href="/recipes" className={pill}>
                Reject
              </Link>
            </div>
          </div>

          <div className={card}>
            <h2 className="text-2xl font-extrabold tracking-tight">Preview</h2>
            <p className="mt-2 text-white/70 text-sm">
              This is how it&apos;ll look once it lives in your Recipes.
            </p>

            <div className="mt-5 rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="text-4xl font-extrabold tracking-tight">
                  {title.trim() || preview?.title || ""}
                </div>
                <ReviewBadge state={preview?.review?.title} />
              </div>

              {preview?.source_url || url.trim() ? (
                <div className="mt-3 text-sm text-white/70">
                  Source:{" "}
                  <a
                    href={preview?.source_url || url.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4 text-white/80 hover:text-white"
                  >
                    {preview?.source_name || "link"}
                  </a>
                </div>
              ) : null}

              {description.trim() ? (
                <div className="mt-4 text-white/80">{description.trim()}</div>
              ) : null}

              <div className="mt-6 rounded-3xl bg-black/20 ring-1 ring-white/10 p-5">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xl font-extrabold">Ingredients</h3>
                      <ReviewBadge state={preview?.review?.ingredients} />
                    </div>

                    {previewIngredients.length === 0 ? (
                      <div className="mt-3 text-white/60">No ingredients yet.</div>
                    ) : (
                      <ul className="mt-3 list-disc pl-5 space-y-1 text-white/80">
                        {previewIngredients.map((ing, idx) => (
                          <li key={`${ing}-${idx}`}>{ing}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xl font-extrabold">Instructions</h3>
                      <ReviewBadge state={preview?.review?.instructions} />
                    </div>

                    {previewInstructions.length === 0 ? (
                      <div className="mt-3 text-white/60">No instructions yet.</div>
                    ) : (
                      <ol className="mt-3 list-decimal pl-5 space-y-2 text-white/80">
                        {previewInstructions.map((step, idx) => (
                          <li key={`${step}-${idx}`}>{step}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
              </div>

              {!preview ? (
                <div className="mt-4 text-sm text-white/60">
                  Paste a URL and click <b>Fetch it</b>.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}