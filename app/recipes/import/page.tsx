// app/recipes/import/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    // eslint-disable-next-line no-new
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

const pill =
  "inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/15 px-6 py-3 font-semibold ring-1 ring-white/10 transition";
const pillPrimary =
  "inline-flex items-center justify-center rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 px-6 py-3 font-semibold text-white shadow-lg shadow-fuchsia-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed";
const card = "rounded-3xl bg-white/5 ring-1 ring-white/10 p-6";

export default function ImportRecipePage() {
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanUrl = url.trim();
  const cleanTitle = title.trim();
  const urlOk = useMemo(() => isValidUrl(cleanUrl), [cleanUrl]);

  async function onImport() {
    setError(null);

    if (!isValidUrl(cleanUrl)) {
      setError("That URL doesn’t look valid. Include https://");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/recipes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: cleanUrl,
          title: cleanTitle || undefined,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Import failed.");
        return;
      }

      if (!data?.id) {
        setError("Imported, but no recipe ID was returned.");
        return;
      }

      router.push(`/recipes/${data.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-white/10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -left-40 h-[420px] w-[420px] rounded-full bg-fuchsia-500/15 blur-3xl" />
          <div className="absolute -bottom-48 -right-40 h-[520px] w-[520px] rounded-full bg-cyan-400/10 blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 pt-10 pb-7">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-5xl font-extrabold tracking-tight">
                Import from URL{" "}
                <span className="inline-block align-middle ml-2 h-3 w-3 rounded-full bg-fuchsia-400 shadow-[0_0_30px_rgba(232,121,249,0.35)]" />
              </h1>
              <p className="mt-3 text-white/75 text-lg">
                Paste a recipe link. I’ll pull out the ingredients and steps.
              </p>
              <div className="mt-2 text-white/45 text-sm">
                Works best on sites that publish recipe data. If it’s stubborn, we’ll handle it another way.
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/recipes" className={pill}>
                ← Back
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className={card}>
          {/* URL */}
          <div className="text-sm font-semibold text-white/85">Recipe URL</div>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.allrecipes.com/recipe/..."
            className="mt-3 w-full rounded-2xl bg-white/5 text-white placeholder:text-white/35 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
          />
          {!urlOk && cleanUrl.length > 0 ? (
            <div className="mt-2 text-sm text-red-200">
              That URL doesn’t look valid. Include <span className="font-semibold">https://</span>
            </div>
          ) : null}

          {/* Title override */}
          <div className="mt-6 text-sm font-semibold text-white/85">Title override (optional)</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Leave blank to use the page’s recipe title"
            className="mt-3 w-full rounded-2xl bg-white/5 text-white placeholder:text-white/35 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
          />
          <div className="mt-2 text-xs text-white/50">
            If the page title is a mess, this is your “nope, we’re not doing that” button.
          </div>

          {/* Errors */}
          {error ? (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {/* Actions */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onImport}
              disabled={!urlOk || loading}
              className={pillPrimary}
              title={!urlOk ? "Paste a valid URL first" : "Import recipe"}
            >
              {loading ? "Importing…" : "Import recipe"}
            </button>

            <Link href="/recipes" className={pill}>
              Cancel
            </Link>
          </div>

          {/* Notes (quiet + helpful) */}
          <div className="mt-7 rounded-2xl bg-white/5 ring-1 ring-white/10 p-4 text-sm text-white/70">
            <div className="font-semibold text-white/85">Notes</div>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-white/65">
              <li>Best results when the site publishes recipe data (JSON-LD).</li>
              <li>If a site blocks fetching, you can still use the “paste” option.</li>
              <li>
                We store readable extracted page text as <code className="px-1 py-0.5 rounded bg-white/10">source_text</code>.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
