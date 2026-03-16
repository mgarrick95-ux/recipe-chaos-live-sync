// app/recipes/photo/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Tesseract from "tesseract.js";

type Parsed = {
  title: string;
  ingredients: string[];
  instructions: string[];
};

function splitLines(text: string) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

// basic fallback (non-AI)
function parseRecipeFromText(raw: string): Parsed {
  const lines = splitLines(raw);

  let title = "";
  const ingredients: string[] = [];
  const instructions: string[] = [];

  title =
    lines.find((l) => l.length >= 6 && l.length <= 80 && !/^\d/.test(l)) ||
    "Untitled recipe";

  const lower = lines.map((l) => l.toLowerCase());
  const ingIdx = lower.findIndex((l) => l.includes("ingredient"));
  const dirIdx = lower.findIndex(
    (l) => l.includes("instruction") || l.includes("direction") || l.includes("method")
  );

  if (ingIdx !== -1 && dirIdx !== -1 && dirIdx > ingIdx) {
    ingredients.push(...lines.slice(ingIdx + 1, dirIdx));
    instructions.push(...lines.slice(dirIdx + 1));
  } else {
    for (const l of lines) {
      if (/^\d+[\).\s]/.test(l)) instructions.push(l.replace(/^\d+[\).\s]*/, ""));
      else ingredients.push(l);
    }
  }

  return {
    title,
    ingredients: ingredients.filter(Boolean).slice(0, 200),
    instructions: instructions.filter(Boolean).slice(0, 200),
  };
}

const pill =
  "inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/15 px-6 py-3 font-semibold ring-1 ring-white/10 transition";
const pillPrimary =
  "inline-flex items-center justify-center rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 px-6 py-3 font-semibold text-white shadow-lg shadow-fuchsia-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed";
const card = "rounded-3xl bg-white/5 ring-1 ring-white/10 p-6";

export default function AddFromPhotoPage() {
  const router = useRouter();

  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number>(0);

  const [raw, setRaw] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiParsed, setAiParsed] = useState<Parsed | null>(null);

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fallbackParsed = useMemo(() => (raw ? parseRecipeFromText(raw) : null), [raw]);

  // prefer AI result when available
  const parsed = aiBusy ? null : aiParsed || fallbackParsed;

  async function runOcr() {
    if (!files.length) return;

    setError(null);
    setAiError(null);
    setAiParsed(null);
    setSaveError(null);

    setBusy(true);
    setProgress(0);

    try {
      const chunks: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const currentFile = files[i];
        const processedImage = await preprocessImageForOCR(currentFile);

        const { data } = await Tesseract.recognize(processedImage, "eng", {
          logger: (m) => {
            if (m.status === "recognizing text" && typeof m.progress === "number") {
              const overallProgress = Math.round(((i + m.progress) / files.length) * 100);
              setProgress(overallProgress);
            }
          },
        });

        const extractedText = (data.text || "").trim();
        if (extractedText) {
          chunks.push(extractedText);
        }
      }

      const combinedText = chunks.join("\n\n--- Next photo ---\n\n");
      setRaw(combinedText);

      if (combinedText.trim()) {
        await tidyText(combinedText);
      }
    } catch (e: any) {
      setError(e?.message || "Couldn't read that photo.");
    } finally {
      setBusy(false);
    }
  }

  async function tidyText(nextRawText: string) {
    const cleanRaw = (nextRawText || "").trim();
    if (!cleanRaw) return;

    setAiBusy(true);
    setAiError(null);
    setAiParsed(null);
    setSaveError(null);

    try {
      const res = await fetch("/api/ai/recipe-from-ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: cleanRaw }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Cleanup failed (${res.status})`);

      if (!json?.ok || !json?.recipe) throw new Error("Cleanup returned no recipe.");

      setAiParsed({
        title: json.recipe.title || "Untitled recipe",
        ingredients: Array.isArray(json.recipe.ingredients) ? json.recipe.ingredients : [],
        instructions: Array.isArray(json.recipe.instructions) ? json.recipe.instructions : [],
      });
    } catch (e: any) {
      setAiError(e?.message || "Couldn't tidy that up.");
    } finally {
      setAiBusy(false);
    }
  }

  async function runAiCleanup() {
    if (!raw.trim()) return;

    setAiBusy(true);
    setAiError(null);
    setAiParsed(null);
    setSaveError(null);

    try {
      const res = await fetch("/api/ai/recipe-from-ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: raw }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Cleanup failed (${res.status})`);

      // your API returns { ok:true, modelUsed, recipe:{...} }
      if (!json?.ok || !json?.recipe) throw new Error("Cleanup returned no recipe.");

      setAiParsed({
        title: json.recipe.title || "Untitled recipe",
        ingredients: Array.isArray(json.recipe.ingredients) ? json.recipe.ingredients : [],
        instructions: Array.isArray(json.recipe.instructions) ? json.recipe.instructions : [],
      });
    } catch (e: any) {
      setAiError(e?.message || "Couldn't tidy that up.");
    } finally {
      setAiBusy(false);
    }
  }

  function clearAll() {
    setFiles([]);
    setRaw("");
    setError(null);
    setProgress(0);

    setAiBusy(false);
    setAiError(null);
    setAiParsed(null);

    setSaveBusy(false);
    setSaveError(null);
  }

  async function saveRecipeNow() {
    if (!parsed) return;

    setSaveBusy(true);
    setSaveError(null);

    try {
      const payload: any = {
        title: (parsed.title || "Untitled recipe").trim(),
        ingredients: parsed.ingredients || [],
        instructions: parsed.instructions || [],
        // keep extra fields minimal to avoid schema surprises
        tags: [],
        favorite: false,
      };

      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);

      // Success: go to main recipes list
      router.push("/recipes");
    } catch (e: any) {
      setSaveError(e?.message || "Save failed.");
      setSaveBusy(false);
    }
  }

  const saveDisabled = !parsed || saveBusy;

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
          <Link href="/recipes" className={pill}>
            Back
          </Link>

          <div className="flex items-center gap-3">
            <button type="button" className={pill} onClick={clearAll}>
              Clear
            </button>

            <button
              type="button"
              className={pillPrimary}
              onClick={saveRecipeNow}
              disabled={saveDisabled}
              title={!parsed ? "Add a photo first" : "Save recipe"}
            >
              {saveBusy ? "Saving..." : "Save recipe"}
            </button>
          </div>
        </div>

        <div className={card}>
          <h1 className="text-5xl font-extrabold tracking-tight">Add from photo</h1>
          <p className="mt-3 text-white/70">
            Take a photo of a recipe. I'll pull out the ingredients and steps for you.
          </p>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {aiError ? (
            <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {aiError}
            </div>
          ) : null}

          {saveError ? (
            <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {saveError}
            </div>
          ) : null}

          <div className="mt-7 grid grid-cols-1 gap-6">
            {/* Step 1 */}
            <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
              <div className="text-sm font-semibold text-white/85">Add a photo</div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  className="text-sm"
                />

                <button
                  type="button"
                  className={pillPrimary}
                  onClick={runOcr}
                  disabled={!files.length || busy}
                >
                  {busy ? `Scanning... ${progress}%` : "Scan photo"}
                </button>

                <button
                  type="button"
                  className={pill}
                  onClick={runAiCleanup}
                  disabled={!raw.trim() || aiBusy}
                  title={!raw.trim() ? "Read the photo first" : "Tidy the extracted text into a usable recipe"}
                >
                  {aiBusy ? "Re-running..." : "Re-run cleanup"}
                </button>
              </div>

              <div className="mt-2 text-xs text-white/60">
                Best results with clear text and good lighting. You can add more than one photo if the recipe spans multiple pages.
              </div>

              {aiParsed ? (
                <div className="mt-3 text-xs font-semibold text-emerald-300">Tidied ...</div>
              ) : raw.trim() ? (
                <div className="mt-3 text-xs text-white/60">Looks like I found a recipe.</div>
              ) : null}
            </div>

            

            {/* Preview */}
            {parsed ? (
              <div className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-5">
                <div className="text-sm font-semibold text-white/85">Review the recipe</div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <div className="text-xs font-semibold text-white/60">Recipe name</div>
                    <div className="mt-1 rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 text-sm">
                      {parsed.title}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-white/60">Ingredients</div>
                    <pre className="mt-1 whitespace-pre-wrap rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 text-sm text-white">
                      {parsed.ingredients.join("\n")}
                    </pre>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-white/60">Steps</div>
                    <pre className="mt-1 whitespace-pre-wrap rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 py-3 text-sm text-white">
                      {parsed.instructions.join("\n")}
                    </pre>
                  </div>
                </div>

                {/* Bottom save (requested) */}
                <div className="mt-6 flex items-center justify-end gap-3">
                  <button type="button" className={pill} onClick={clearAll}>
                    Clear
                  </button>

                  <button
                    type="button"
                    className={pillPrimary}
                    onClick={saveRecipeNow}
                    disabled={saveDisabled}
                    title={!parsed ? "Add a photo first" : "Save recipe"}
                  >
                    {saveBusy ? "Saving..." : "Save recipe"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}





async function preprocessImageForOCR(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject("File read failed");
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject("Image load failed");
    el.src = dataUrl;
  });

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas error");

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];

    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    gray = (gray - 128) * 1.6 + 128;

    const v = gray > 165 ? 255 : 0;

    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL("image/png");
}























