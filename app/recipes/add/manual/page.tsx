// app/recipes/add/manual/page.tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  RecipeForm,
  defaultRecipeFormValues,
  type RecipeFormValues,
} from "@/components/recipes/RecipeForm";

const SUGGESTED_DRAFT_KEY = "rc_suggested_draft_v1";

function linesToArray(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function arrayToLines(arr: any): string {
  if (!arr) return "";
  if (Array.isArray(arr)) return arr.map((x) => String(x)).join("\n");
  return String(arr);
}

function tagsToString(tags: any): string {
  if (!tags) return "";
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean).join(", ");
  return String(tags);
}

export default function AddRecipeManualPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [values, setValues] = useState<RecipeFormValues>(defaultRecipeFormValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from query params OR suggested-draft storage (once)
  useEffect(() => {
    const fromSuggested = (sp?.get("fromSuggested") || "").trim() === "1";

    // 1) If fromSuggested=1, try session draft first
    if (fromSuggested) {
      try {
        const raw = window.sessionStorage.getItem(SUGGESTED_DRAFT_KEY);
        if (raw) {
          const draft = JSON.parse(raw);

          setValues((prev) => ({
            ...prev,
            title: String(draft?.title ?? prev.title),
            description: String(draft?.description ?? prev.description),
            tags: tagsToString(draft?.tags ?? prev.tags),
            source_url: String(draft?.source_url ?? prev.source_url),
            source_name: String(draft?.source_name ?? prev.source_name),
            ingredientsText: arrayToLines(draft?.ingredients ?? prev.ingredientsText),
            instructionsText: arrayToLines(draft?.instructions ?? prev.instructionsText),
          }));

          // one-time use so it doesn't keep re-applying forever
          window.sessionStorage.removeItem(SUGGESTED_DRAFT_KEY);
          return;
        }
      } catch {
        // fall through to query param prefill
      }
    }

    // 2) Otherwise (or if no session draft), prefill basic query params
    const title = (sp?.get("title") || "").trim();
    const source_url = (sp?.get("source_url") || "").trim();
    const source_name = (sp?.get("source_name") || "").trim();

    if (title || source_url || source_name) {
      setValues((prev) => ({
        ...prev,
        title: title || prev.title,
        source_url: source_url || prev.source_url,
        source_name: source_name || prev.source_name,
      }));
    }
  }, [sp]);

  const canSave = useMemo(
    () => values.title.trim().length > 0 && !saving,
    [values.title, saving]
  );

  async function onSubmit() {
    setError(null);

    const title = values.title.trim();
    if (!title) {
      setError("Title is required.");
      return;
    }

    const payload = {
      title,
      description: values.description?.trim() || null,
      tags: values.tags ? values.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      favorite: values.favorite ?? false,

      serves: values.servings ? Number(values.servings) : null,
      prep_minutes: values.prep_minutes ? Number(values.prep_minutes) : null,
      cook_minutes: values.cook_minutes ? Number(values.cook_minutes) : null,

      ingredients: linesToArray(values.ingredientsText),
      instructions: linesToArray(values.instructionsText),

      source_url: values.source_url?.trim() || null,
      source_name: values.source_name?.trim() || null,
    };

    setSaving(true);
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);

      router.push("/recipes");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const pill =
    "inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/15 px-6 py-3 font-semibold ring-1 ring-white/10 transition";
  const pillPrimary =
    "inline-flex items-center gap-2 rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 px-6 py-3 font-semibold text-white shadow-lg shadow-fuchsia-500/20 transition";

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
          <Link href="/recipes/add" className={pill}>
            ← Back
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/recipes/clip" className={pill}>
              Save from URL
            </Link>
            <Link href="/recipes/photo" className={pill}>
              Add from photo
            </Link>

            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSave}
              className={`${pillPrimary} ${!canSave ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-6">
          {/* Dark override wrapper */}
          <div className="rcFormDark">
            <RecipeForm
              values={values}
              onChange={setValues}
              onSubmit={onSubmit}
              submitLabel={saving ? "Saving…" : "Save"}
              disabled={!canSave}
              notice={error}
              topLeftSlot={null}
              topRightSlot={null}
            />
          </div>
        </div>
      </div>

      {/* Overrides only apply inside .rcFormDark */}
      <style jsx global>{`
        .rcFormDark {
          color: rgba(255, 255, 255, 0.92);
        }

        .rcFormDark :is(section, fieldset, .card, .panel, .container, .content, .box, .wrap, .formCard) {
          background: rgba(255, 255, 255, 0.06) !important;
          border-color: rgba(255, 255, 255, 0.10) !important;
        }

        .rcFormDark :is(label, legend, h1, h2, h3, h4, p, span, div) {
          color: rgba(255, 255, 255, 0.88);
        }

        .rcFormDark input,
        .rcFormDark textarea,
        .rcFormDark select {
          background: rgba(0, 0, 0, 0.28) !important;
          color: rgba(255, 255, 255, 0.92) !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          border-radius: 16px !important;
        }

        .rcFormDark textarea {
          border-radius: 18px !important;
        }

        .rcFormDark input::placeholder,
        .rcFormDark textarea::placeholder {
          color: rgba(255, 255, 255, 0.42) !important;
        }

        .rcFormDark input:focus,
        .rcFormDark textarea:focus,
        .rcFormDark select:focus {
          outline: none !important;
          border-color: rgba(217, 70, 239, 0.35) !important;
          box-shadow: 0 0 0 4px rgba(217, 70, 239, 0.12) !important;
        }

        .rcFormDark input[type="checkbox"],
        .rcFormDark input[type="radio"] {
          accent-color: rgb(217, 70, 239);
        }

        .rcFormDark :is(hr) {
          border-color: rgba(255, 255, 255, 0.10) !important;
        }
      `}</style>
    </div>
  );
}
