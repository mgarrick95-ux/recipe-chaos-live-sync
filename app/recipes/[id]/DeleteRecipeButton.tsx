"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  recipeId: string;
  recipeTitle: string;
};

export default function DeleteRecipeButton({ recipeId, recipeTitle }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setError(null);

    const ok = window.confirm(
      `Delete this recipe?\n\n"${recipeTitle}"\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/recipes/${recipeId}`, {
        method: "DELETE",
      });

      // Some routes return 204 No Content
      if (!res.ok) {
        let msg = "Delete failed.";
        try {
          const data = await res.json();
          msg = data?.error ?? msg;
        } catch {
          // ignore
        }
        setError(msg);
        return;
      }

      router.push("/recipes");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      <button
        onClick={onDelete}
        disabled={deleting}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.2)",
          cursor: deleting ? "not-allowed" : "pointer",
          opacity: deleting ? 0.7 : 1,
          color: "white",
          background: "crimson",
        }}
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>

      {error && (
        <div style={{ fontSize: 12, color: "crimson", fontWeight: 600 }}>
          {error}
        </div>
      )}
    </div>
  );
}
