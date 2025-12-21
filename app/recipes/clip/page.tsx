// app/recipes/clip/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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

export default function RecipeClipPage() {
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urlOk = useMemo(() => isValidUrl(url.trim()), [url]);
  const canSave = useMemo(() => {
    // Title optional; API will derive if blank. URL optional too.
    // But we prevent obvious invalid URL formats.
    return urlOk && !saving;
  }, [urlOk, saving]);

  async function onSave() {
    setError(null);

    const cleanUrl = url.trim();
    const cleanTitle = title.trim();

    if (!isValidUrl(cleanUrl)) {
      setError("That URL doesn’t look valid. Include https:// and try again.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/recipes/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: cleanUrl || undefined,
          title: cleanTitle || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Could not save recipe.");
        return;
      }

      if (!data?.id) {
        setError("Saved, but no recipe ID was returned.");
        return;
      }

      // Redirect to the existing recipe detail page
      router.push(`/recipes/${data.id}`);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Could not save recipe.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Save a Recipe from a URL</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>
            Web Clip (Phase 3A): paste a link, save it, then fill in ingredients/instructions when you’re ready.
          </p>
        </div>
        <Link href="/recipes" style={{ textDecoration: "none" }}>
          ← Back to Recipes
        </Link>
      </div>

      <div style={{ marginTop: 20, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 16 }}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
          Recipe URL (optional)
        </label>
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
          <div style={{ marginTop: 8, color: "crimson" }}>
            That URL doesn’t look valid. Include https://
          </div>
        )}

        <div style={{ height: 14 }} />

        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
          Title (optional)
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Leave blank to auto-name from the website"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            outline: "none",
          }}
        />

        {error && (
          <div style={{ marginTop: 12, color: "crimson", fontWeight: 600 }}>
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

        <div style={{ marginTop: 14, opacity: 0.75, fontSize: 13, lineHeight: 1.4 }}>
          Notes:
          <ul style={{ marginTop: 6 }}>
            <li>URL is stored for reference only (no scraping in Phase 3A).</li>
            <li>If you leave Title blank, we auto-name it using the domain.</li>
            <li>After saving, you’ll land on the recipe page to fill in ingredients/instructions.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
