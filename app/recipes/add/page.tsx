"use client";

import Link from "next/link";

const pill =
  "inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/15 px-6 py-3 font-semibold ring-1 ring-white/10";
const pillPrimary =
  "inline-flex items-center gap-2 rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 px-6 py-3 font-semibold shadow-lg shadow-fuchsia-500/20";
const card =
  "rounded-3xl bg-white/5 ring-1 ring-white/10 p-6 hover:bg-white/[0.07] transition";

export default function AddRecipeHubPage() {
  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-6xl font-extrabold tracking-tight">Add a recipe</h1>
            <p className="mt-3 text-white/70">
              Pick a method. You can always edit after.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/recipes" className={pill}>
              ← Back to Recipes
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <Link href="/recipes/add/manual" className={card}>
            <div className="text-2xl font-extrabold tracking-tight">Manual</div>
            <div className="mt-2 text-white/70">
              Type it in (title, tags, ingredients, steps).
            </div>
            <div className="mt-5">
              <span className={pillPrimary}>Start manual</span>
            </div>
          </Link>

          <Link href="/recipes/clip" className={card}>
            <div className="text-2xl font-extrabold tracking-tight">Save from URL</div>
            <div className="mt-2 text-white/70">
              Paste a link, preview, then save only what you want.
            </div>
            <div className="mt-5">
              <span className={pillPrimary}>Paste a link</span>
            </div>
          </Link>

          <Link href="/recipes/photo" className={card}>
            <div className="text-2xl font-extrabold tracking-tight">Photo</div>
            <div className="mt-2 text-white/70">
              Upload a screenshot/photo, run OCR, then send to the add form.
            </div>
            <div className="mt-5">
              <span className={pillPrimary}>Upload photo</span>
            </div>
          </Link>
        </div>

        <div className="mt-10 rounded-3xl bg-white/5 ring-1 ring-white/10 p-6 text-white/70">
          Tip: if you’re tired, use <b>Save from URL</b> or <b>Photo</b> and clean it up later.
        </div>
      </div>
    </div>
  );
}
