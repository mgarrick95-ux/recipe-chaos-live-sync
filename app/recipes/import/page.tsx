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

export default function ImportRecipePage() {
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urlOk = useMemo(() => isValidUrl(url.trim()), [url]);

  async function onImport() {
    setError(null);

    const cleanUrl = url.trim();
    const cleanTitle = title.trim();

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
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, margin: 0 }}>Import from URL</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>
            This fetches the recipe text from the page (JSON-LD when available) and saves ingredients + steps into RecipeChaos.
          </p>
        </div>
        <Link href="/recipes" style={{ textDecoration: "none" }}>
          ← Back to Recipes
        </Link>
      </div>

      <div style={{ marginTop: 18, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14, padding: 16 }}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Recipe URL</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.allrecipes.com/recipe/..."
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            outline: "none",
          }}
        />
        {!urlOk && url.trim().length > 0 ? (
          <div style={{ marginTop: 8, color: "crimson", fontWeight: 700 }}>
            That URL doesn’t look valid. Include https://
          </div>
        ) : null}

        <div style={{ height: 12 }} />

        <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Title override (optional)</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Leave blank to use the page’s recipe title"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            outline: "none",
          }}
        />

        {error ? (
          <div style={{ marginTop: 12, color: "crimson", fontWeight: 800 }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            onClick={onImport}
            disabled={!urlOk || loading}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: !urlOk || loading ? "not-allowed" : "pointer",
              opacity: !urlOk || loading ? 0.6 : 1,
            }}
          >
            {loading ? "Importing…" : "Import recipe"}
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

        <div style={{ marginTop: 14, fontSize: 13, opacity: 0.75, lineHeight: 1.45 }}>
          Notes:
          <ul style={{ marginTop: 6 }}>
            <li>Works best when the site provides Recipe JSON-LD (many do)</li>
            <li>If the site blocks fetching, you can still use Paste Parser</li>
            <li>We store readable extracted page text as <code>source_text</code> so it can be shown inside the app</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
