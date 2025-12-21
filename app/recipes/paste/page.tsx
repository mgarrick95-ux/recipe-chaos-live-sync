// app/recipes/paste/page.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function normalizeText(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripLinePrefix(line: string): string {
  let s = line.trim();

  s = s.replace(/^[-*•‣▪◦]+\s+/, "");
  s = s.replace(/^\[[ xX]\]\s+/, "");
  s = s.replace(/^\(?\d+\)?[.)]\s+/, "");
  s = s.replace(/^step\s+\d+[:\-]\s+/i, "");

  return s.trim();
}

function splitToLines(block: string): string[] {
  const raw = normalizeText(block).trim();
  if (!raw) return [];

  return raw
    .split("\n")
    .map((l) => stripLinePrefix(l))
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function splitInstructions(block: string): string[] {
  const raw = normalizeText(block).trim();
  if (!raw) return [];

  const hasBlankLines = /\n\s*\n/.test(raw);

  if (hasBlankLines) {
    return raw
      .split(/\n\s*\n+/)
      .map((p) => p.split("\n").map((l) => stripLinePrefix(l)).join(" "))
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  return splitToLines(raw);
}

function removeHeader(lines: string[], headerWords: string[]): string[] {
  if (lines.length === 0) return lines;
  const first = lines[0].toLowerCase().replace(/[:\-–—]+$/g, "").trim();
  if (headerWords.includes(first)) return lines.slice(1);
  return lines;
}

function isValidUrl(url: string): boolean {
  if (!url) return true; // optional
  try {
    // eslint-disable-next-line no-new
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export default function PasteRecipePage() {
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  const [ingredientsText, setIngredientsText] = useState("");
  const [instructionsText, setInstructionsText] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urlOk = useMemo(() => isValidUrl(url.trim()), [url]);

  const parsedIngredients = useMemo(() => {
    const lines = splitToLines(ingredientsText);
    return removeHeader(lines, ["ingredients", "ingredient"]);
  }, [ingredientsText]);

  const parsedInstructions = useMemo(() => {
    const lines = splitInstructions(instructionsText);
    return removeHeader(lines, ["instructions", "direction", "directions", "method"]);
  }, [instructionsText]);

  const canSave = useMemo(() => {
    if (saving) return false;
    if (!urlOk) return false;
    if (parsedIngredients.length === 0 && parsedInstructions.length === 0) return false;
    return true;
  }, [saving, urlOk, parsedIngredients.length, parsedInstructions.length]);

  async function onSave() {
    setError(null);

    const cleanUrl = url.trim();
    const cleanTitle = title.trim();

    if (!isValidUrl(cleanUrl)) {
      setError("That URL doesn’t look valid. Include https:// and try again.");
      return;
    }

    if (parsedIngredients.length === 0 && parsedInstructions.length === 0) {
      setError("Paste ingredients and/or instructions before saving.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/recipes/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: cleanUrl || undefined,
          title: cleanTitle || undefined,
          ingredientsText: ingredientsText || undefined,
          instructionsText: instructionsText || undefined,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? "Could not save recipe.");
        return;
      }

      if (!data?.id) {
        setError("Saved, but no recipe ID was returned.");
        return;
      }

      router.push(`/recipes/${data.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Could not save recipe.");
    } finally {
      setSaving(false);
    }
  }

  function onClear() {
    setUrl("");
    setTitle("");
    setIngredientsText("");
    setInstructionsText("");
    setError(null);
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Paste a Recipe</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>
            Phase 3B: paste ingredients + steps, preview the parsed result, then save.
          </p>
        </div>
        <Link href="/recipes" style={{ textDecoration: "none" }}>
          ← Back to Recipes
        </Link>
      </div>

      <div style={{ marginTop: 18, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Source URL (optional)</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/recipe"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.2)",
                outline: "none",
              }}
            />
            {!urlOk && (
              <div style={{ marginTop: 8, color: "crimson", fontWeight: 600 }}>
                That URL doesn’t look valid. Include https://
              </div>
            )}
          </div>

          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Title (optional)</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Leave blank to auto-name"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.2)",
                outline: "none",
              }}
            />
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Ingredients (paste block)</label>
            <textarea
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              placeholder={`Example:\n• 1 lb ground beef\n• 1 tsp salt\n• 2 cups shredded cheese`}
              rows={14}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.2)",
                outline: "none",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              Parsed: <b>{parsedIngredients.length}</b>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Instructions (paste block)</label>
            <textarea
              value={instructionsText}
              onChange={(e) => setInstructionsText(e.target.value)}
              placeholder={`Example:\n1) Preheat oven to 350°F\n2) Mix ingredients\n3) Bake 25 minutes`}
              rows={14}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.2)",
                outline: "none",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              Parsed: <b>{parsedInstructions.length}</b>
            </div>
          </div>
        </div>

        <div style={{ height: 12 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Preview Ingredients</div>
            {parsedIngredients.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No ingredients parsed yet.</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {parsedIngredients.slice(0, 12).map((x, i) => (
                  <li key={`${x}-${i}`}>{x}</li>
                ))}
              </ul>
            )}
            {parsedIngredients.length > 12 ? (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                + {parsedIngredients.length - 12} more
              </div>
            ) : null}
          </div>

          <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Preview Instructions</div>
            {parsedInstructions.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No instructions parsed yet.</div>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {parsedInstructions.slice(0, 10).map((x, i) => (
                  <li key={`${x}-${i}`} style={{ marginBottom: 6 }}>
                    {x}
                  </li>
                ))}
              </ol>
            )}
            {parsedInstructions.length > 10 ? (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                + {parsedInstructions.length - 10} more
              </div>
            ) : null}
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 12, color: "crimson", fontWeight: 700 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            onClick={onSave}
            disabled={!canSave}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: canSave ? "pointer" : "not-allowed",
              opacity: canSave ? 1 : 0.6,
            }}
          >
            {saving ? "Saving…" : "Save recipe"}
          </button>

          <button
            type="button"
            onClick={onClear}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              cursor: "pointer",
              opacity: 0.9,
            }}
          >
            Clear
          </button>

          <Link
            href="/recipes"
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.08)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Cancel
          </Link>
        </div>

        <div style={{ marginTop: 12, opacity: 0.75, fontSize: 13, lineHeight: 1.4 }}>
          Parsing rules (simple + predictable):
          <ul style={{ marginTop: 6 }}>
            <li>Bullets and numbering are stripped (•, -, 1., 1), Step 1:)</li>
            <li>Ingredients split by lines</li>
            <li>Instructions split by blank lines if present; otherwise by lines</li>
            <li>We do not fetch anything from the URL in Phase 3B</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
