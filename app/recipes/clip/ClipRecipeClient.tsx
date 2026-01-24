// app/recipes/clip/page.tsx
"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type PreviewData = {
  title: string;
  description?: string | null;
  ingredients: string[];
  instructions: string[];
  source_url: string;
  source_name?: string | null;
  source_text?: string | null;
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

// Light cleanup: make ugly scraped titles less ugly (no extra decisions)
function cleanTitle(input: string): string {
  let s = (input || "").trim();

  // common html entities (minimal set, safe)
  s = s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");

  // strip repeated trailing punctuation
  s = s.replace(/[!?.]{3,}$/g, "!!");

  // remove obvious site separators at the end: "Title - Site" / "Title | Site"
  // (only if it looks like a long “title glue” situation)
  const parts = s.split(/\s[|–-]\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const left = parts[0];
    // if left is reasonably long, prefer it
    if (left.length >= 8) s = left;
  }

  // final trim + clamp to something sane
  s = s.trim();
  if (s.length > 120) s = s.slice(0, 120).trim();

  return s || "Clipped recipe";
}

export default function SaveFromUrlPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewData | null>(null);

  // editable fields (what actually gets saved)
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [instructionsText, setInstructionsText] = useState("");

  // allow ?url= to prefill and auto-preview once
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
    // split paragraphs into lines if user pastes blocks
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
      if (!res.ok) throw new Error(json?.error || "Couldn’t preview that link.");

      const data = json as PreviewData;

      setPreview(data);

      const cleaned = cleanTitle(data.title || "");
      setTitle(cleaned);
      setDescription((data.description || "").trim());
      setIngredientsText(toMultiline(data.ingredients || []));
      setInstructionsText(toMultiline(data.instructions || []));
    } catch (e: any) {
      setErr(e?.message || "Preview failed.");
    } finally {
      setLoading(false);
    }
  }

  // auto-run preview once if opened with ?url=
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

  // styling helpers (match Recipes motif)
  const pill =
    "inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/15 px-6 py-3 font-semibold ring-1 ring-white/10 transition";
  const pillPrimary =
    "inline-flex items-center gap-2 rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 px-6 py-3 font-semibold text-white shadow-lg shadow-fuchsia-500/20 transition";
  const card = "rounded-3xl bg-white/5 ring-1 ring-white/10 p-6";

  const saveDisabled = loading || (!title.trim() && !preview);

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      {/* Header banner */}
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
                Paste a link. I’ll yank out the good parts. You keep control.
              </p>
              <div className="mt-2 text-white/45 text-sm">
                Preview first, edit anything, then save to your vault.
              </div>
            </div>

            <Link href="/recipes" className={pill}>
              ← Back to recipes
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* URL input panel */}
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
              {loading ? "Fetching…" : "Fetch it"}
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
              Tip: if the site is dramatic and blocks scraping, try the Paste option instead.
            </div>
          ) : null}
        </div>

        {/* Editor + preview */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Left: editable fields */}
          <div className={card}>
            <h2 className="text-2xl font-extrabold tracking-tight">What you’ll save</h2>
            <p className="mt-2 text-white/70 text-sm">
              Edit anything. Delete anything. Make it yours.
            </p>

            <div className="mt-5">
              <label className="block font-bold text-white/90 mb-2">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give it a name you’ll recognize later"
                className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none text-white placeholder:text-white/40 focus:ring-2 focus:ring-fuchsia-400/50"
              />
            </div>

            <div className="mt-5">
              <label className="block font-bold text-white/90 mb-2">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional: one-liner, vibe, or warning label"
                className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none text-white placeholder:text-white/40 focus:ring-2 focus:ring-fuchsia-400/50 resize-y"
              />
            </div>

            <div className="mt-5">
              <label className="block font-bold text-white/90 mb-2">Ingredients</label>
              <textarea
                value={ingredientsText}
                onChange={(e) => setIngredientsText(e.target.value)}
                rows={10}
                placeholder="One per line is happiest."
                className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none text-white placeholder:text-white/40 focus:ring-2 focus:ring-fuchsia-400/50 resize-y"
              />
            </div>

            <div className="mt-5">
              <label className="block font-bold text-white/90 mb-2">Instructions / Steps</label>
              <textarea
                value={instructionsText}
                onChange={(e) => setInstructionsText(e.target.value)}
                rows={10}
                placeholder="Steps, notes, or chaos — we’ll format it."
                className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 outline-none text-white placeholder:text-white/40 focus:ring-2 focus:ring-fuchsia-400/50 resize-y"
              />
              <div className="mt-2 text-xs text-white/50">
                Tip: blank lines become separate steps. Or just paste and let it ride.
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
                {loading ? "Saving…" : "Save to vault"}
              </button>

              <Link href="/recipes" className={pill}>
                Cancel
              </Link>
            </div>
          </div>

          {/* Right: preview */}
          <div className={card}>
            <h2 className="text-2xl font-extrabold tracking-tight">
              Preview
            </h2>
            <p className="mt-2 text-white/70 text-sm">
              This is how it’ll look once it lives in your Recipes.
            </p>

            <div className="mt-5 rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
              <div className="text-4xl font-extrabold tracking-tight">
                {title.trim() || preview?.title || "—"}
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
                    <h3 className="text-xl font-extrabold">Ingredients</h3>
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
                    <h3 className="text-xl font-extrabold">Instructions</h3>
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
