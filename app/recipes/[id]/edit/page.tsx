"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Recipe = {
  id: string;
  title: string;
  description?: string | null;
  tags?: any;
  serves?: number | null;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  ingredients?: any;
  instructions?: any;
  steps?: any;

  image_url?: string | null; // may NOT exist in DB
  imageUrl?: string | null;
  photo_url?: string | null;
  cover_image_url?: string | null;
  image?: string | null;
  photo?: string | null;
};

function normalizeToStringArray(value: unknown): string[] {
  if (!value) return [];

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];
    const parts = s.includes("\n") ? s.split("\n") : s.split(",");
    return parts.map((p) => p.trim()).filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v == null) return "";
        if (typeof v === "string") return v;
        if (typeof v === "number" || typeof v === "boolean") return String(v);

        if (typeof v === "object") {
          const obj = v as any;
          return obj.name ?? obj.text ?? obj.ingredient ?? obj.item ?? obj.value ?? "";
        }

        return String(v);
      })
      .map((s) => String(s).trim())
      .filter(Boolean);
  }

  if (typeof value === "object") {
    const obj = value as any;
    const maybe = obj.ingredients ?? obj.items ?? obj.list ?? obj.text ?? null;
    if (maybe) return normalizeToStringArray(maybe);
  }

  return [];
}

function arrayToLines(arr: string[]): string {
  return arr.join("\n");
}

function tagsToCsv(tags: unknown): string {
  const arr = normalizeToStringArray(tags);
  return arr.join(", ");
}

function csvToTags(text: string): string[] {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

type ImageFieldKey =
  | "cover_image_url"
  | "photo_url"
  | "image"
  | "photo"
  | "imageUrl"
  | "image_url";

function detectExistingImageFieldKey(r: any): ImageFieldKey | null {
  const candidates: ImageFieldKey[] = [
    "cover_image_url",
    "photo_url",
    "image",
    "photo",
    "imageUrl",
    "image_url",
  ];

  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(r, key)) return key;
  }
  return null;
}

function getImageValue(r: any): string {
  return (
    r?.cover_image_url ||
    r?.photo_url ||
    r?.image ||
    r?.photo ||
    r?.imageUrl ||
    r?.image_url ||
    ""
  );
}

export default function EditRecipePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [imageFieldKey, setImageFieldKey] = useState<ImageFieldKey | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [servesText, setServesText] = useState("");
  const [prepText, setPrepText] = useState("");
  const [cookText, setCookText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [instructionsText, setInstructionsText] = useState("");

  const canSave = useMemo(() => title.trim().length > 0, [title]);

  const pillBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 18px",
    borderRadius: "999px",
    fontWeight: 700,
    fontSize: "15px",
    textDecoration: "none",
    lineHeight: 1,
    cursor: "pointer",
    userSelect: "none",
    border: "1px solid rgba(255,255,255,0.14)",
  };

  const pillGhost: React.CSSProperties = {
    ...pillBase,
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.92)",
    backdropFilter: "blur(8px)",
  };

  const pillPrimary: React.CSSProperties = {
    ...pillBase,
    background: "#d946ef",
    color: "#fff",
    border: "1px solid rgba(0,0,0,0)",
    boxShadow: "0 10px 25px rgba(217, 70, 239, 0.25)",
  };

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setLoadError(null);

        const res = await fetch(`/api/recipes/${id}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);

        if (!res.ok) throw new Error(json?.error || "Failed to load recipe");

        const r = (json?.recipe ?? json) as Recipe;

        if (!alive) return;

        setRecipe(r);

        const key = detectExistingImageFieldKey(r);
        setImageFieldKey(key);

        setTitle(r.title ?? "");
        setDescription(r.description ?? "");
        setTagsText(tagsToCsv(r.tags));
        setServesText(r.serves != null ? String(r.serves) : "");
        setPrepText(r.prep_minutes != null ? String(r.prep_minutes) : "");
        setCookText(r.cook_minutes != null ? String(r.cook_minutes) : "");
        setImageUrl(getImageValue(r) || "");

        setIngredientsText(arrayToLines(normalizeToStringArray(r.ingredients)));
        setInstructionsText(arrayToLines(normalizeToStringArray(r.instructions ?? r.steps)));
      } catch (e: any) {
        if (!alive) return;
        setLoadError(e?.message || "Failed to load recipe");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [id]);

  async function onSave() {
    if (!canSave || saving) return;

    setSaving(true);
    setSaveError(null);

    const payload: any = {
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      tags: tagsText.trim() ? csvToTags(tagsText) : null,
      serves: servesText.trim() ? Number(servesText) : null,
      prep_minutes: prepText.trim() ? Number(prepText) : null,
      cook_minutes: cookText.trim() ? Number(cookText) : null,
      ingredients: ingredientsText.trim()
        ? ingredientsText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
        : null,
      instructions: instructionsText.trim()
        ? instructionsText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
        : null,
    };

    if (payload.serves != null && Number.isNaN(payload.serves)) payload.serves = null;
    if (payload.prep_minutes != null && Number.isNaN(payload.prep_minutes)) payload.prep_minutes = null;
    if (payload.cook_minutes != null && Number.isNaN(payload.cook_minutes)) payload.cook_minutes = null;

    if (imageFieldKey) {
      payload[imageFieldKey] = imageUrl.trim() ? imageUrl.trim() : null;
    }

    try {
      const res = await fetch(`/api/recipes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to save recipe");

      router.push("/recipes");
      router.refresh();
    } catch (e: any) {
      setSaveError(e?.message || "Failed to save recipe");
      setSaving(false);
    }
  }

  const imageHint = useMemo(() => {
    if (imageFieldKey) return "If you add a photo, the Recipe cards will show it.";
    return "Photo saving is disabled for this recipe (no image column detected).";
  }, [imageFieldKey]);

  return (
    <div className="rcPage">
      <div className="rcWrap">
        <div className="rcTopRow">
          <Link href="/recipes" style={pillGhost}>
            ← Back
          </Link>

          <div className="rcTopActions">
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave || saving}
              style={{
                ...pillPrimary,
                opacity: !canSave || saving ? 0.55 : 1,
                cursor: !canSave || saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>

            <Link href={`/recipes/${id}`} style={pillGhost}>
              View
            </Link>
          </div>
        </div>

        <h1 className="rcTitle">
          {loading ? "Edit Recipe" : `Edit: ${recipe?.title ?? "Recipe"}`}
        </h1>

        {loadError ? <div className="rcError">{loadError}</div> : null}
        {saveError ? <div className="rcError">{saveError}</div> : null}

        {loading ? (
          <div className="rcMuted" style={{ marginTop: 18 }}>
            Loading…
          </div>
        ) : recipe ? (
          <div className="rcCard">
            <div className="rcGrid">
              <div className="rcField rcSpan2">
                <label className="rcLabel">Title</label>
                <input className="rcInput" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div className="rcField rcSpan2">
                <label className="rcLabel">Description</label>
                <input
                  className="rcInput"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional short note"
                />
              </div>

              <div className="rcField rcSpan2">
                <label className="rcLabel">Image URL</label>
                <input
                  className="rcInput"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Optional — paste an image URL"
                  disabled={!imageFieldKey}
                />
                <div className="rcHint">{imageHint}</div>
              </div>

              <div className="rcField rcSpan2">
                <label className="rcLabel">Tags (comma separated)</label>
                <input
                  className="rcInput"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="Pasta, Comfort, Weeknight"
                />
              </div>

              <div className="rcField">
                <label className="rcLabel">Serves</label>
                <input
                  className="rcInput"
                  value={servesText}
                  onChange={(e) => setServesText(e.target.value)}
                  inputMode="numeric"
                />
              </div>

              <div className="rcField">
                <label className="rcLabel">Prep (minutes)</label>
                <input
                  className="rcInput"
                  value={prepText}
                  onChange={(e) => setPrepText(e.target.value)}
                  inputMode="numeric"
                />
              </div>

              <div className="rcField">
                <label className="rcLabel">Cook (minutes)</label>
                <input
                  className="rcInput"
                  value={cookText}
                  onChange={(e) => setCookText(e.target.value)}
                  inputMode="numeric"
                />
              </div>

              <div className="rcField rcSpan2">
                <label className="rcLabel">Ingredients (one per line)</label>
                <textarea
                  className="rcTextarea"
                  value={ingredientsText}
                  onChange={(e) => setIngredientsText(e.target.value)}
                />
              </div>

              <div className="rcField rcSpan2">
                <label className="rcLabel">Instructions (one per line)</label>
                <textarea
                  className="rcTextarea"
                  value={instructionsText}
                  onChange={(e) => setInstructionsText(e.target.value)}
                />
              </div>
            </div>

            <div className="rcBottomRow">
              <button
                type="button"
                onClick={onSave}
                disabled={!canSave || saving}
                style={{
                  ...pillPrimary,
                  opacity: !canSave || saving ? 0.55 : 1,
                  cursor: !canSave || saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        ) : (
          <div className="rcMuted" style={{ marginTop: 18 }}>
            Recipe not found.
          </div>
        )}
      </div>

      <style jsx>{`
        .rcPage {
          min-height: 100vh;
          background:
            radial-gradient(1200px 800px at 15% 20%, rgba(217, 70, 239, 0.14), transparent 55%),
            radial-gradient(900px 600px at 85% 25%, rgba(56, 189, 248, 0.10), transparent 55%),
            linear-gradient(180deg, #060812 0%, #050814 60%, #040612 100%);
          color: rgba(255, 255, 255, 0.92);
        }

        .rcWrap {
          max-width: 980px;
          margin: 0 auto;
          padding: 34px 24px 60px 24px;
        }

        .rcTopRow {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
        }

        .rcTopActions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }

        .rcTitle {
          margin: 18px 0 0 0;
          font-size: 44px;
          line-height: 1.1;
          font-weight: 900;
          letter-spacing: -0.02em;
        }

        .rcError {
          margin-top: 16px;
          border-radius: 18px;
          padding: 14px 16px;
          background: rgba(248, 113, 113, 0.12);
          border: 1px solid rgba(248, 113, 113, 0.22);
          color: rgba(255, 220, 220, 0.95);
        }

        .rcCard {
          margin-top: 22px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.10);
          border-radius: 26px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
          padding: 18px;
          backdrop-filter: blur(10px);
        }

        .rcGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .rcSpan2 {
          grid-column: span 2;
        }

        .rcField {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .rcLabel {
          font-weight: 800;
          color: rgba(255, 255, 255, 0.78);
          font-size: 14px;
        }

        .rcInput {
          width: 100%;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(0, 0, 0, 0.25);
          color: rgba(255, 255, 255, 0.92);
          padding: 12px 14px;
          font-size: 15px;
          outline: none;
        }

        .rcInput::placeholder {
          color: rgba(255, 255, 255, 0.35);
        }

        .rcInput:focus {
          border-color: rgba(217, 70, 239, 0.35);
          box-shadow: 0 0 0 4px rgba(217, 70, 239, 0.12);
        }

        .rcInput:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .rcTextarea {
          width: 100%;
          min-height: 160px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(0, 0, 0, 0.25);
          color: rgba(255, 255, 255, 0.92);
          padding: 12px 14px;
          font-size: 15px;
          outline: none;
          resize: vertical;
          line-height: 1.35;
        }

        .rcTextarea:focus {
          border-color: rgba(217, 70, 239, 0.35);
          box-shadow: 0 0 0 4px rgba(217, 70, 239, 0.12);
        }

        .rcHint {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.50);
        }

        .rcBottomRow {
          margin-top: 16px;
          display: flex;
          justify-content: flex-end;
        }

        .rcMuted {
          color: rgba(255, 255, 255, 0.55);
        }

        @media (max-width: 720px) {
          .rcGrid {
            grid-template-columns: 1fr;
          }
          .rcSpan2 {
            grid-column: span 1;
          }
          .rcTitle {
            font-size: 38px;
          }
        }
      `}</style>
    </div>
  );
}
