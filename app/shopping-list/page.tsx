// app/shopping-list/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  name: string;
  source_type: "manual" | "derived" | string;
  checked: boolean;
};

async function callApi(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || text || `Request failed: ${res.status}`);
  }
  return json;
}

export default function ShoppingListPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const counts = useMemo(() => {
    const manual = items.filter((i) => i.source_type === "manual").length;
    const derived = items.filter((i) => i.source_type === "derived").length;
    return { manual, derived };
  }, [items]);

  async function refresh() {
    const json = await callApi("/api/shopping-list");
    setItems(Array.isArray(json.items) ? json.items : []);
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);

  async function addManual() {
    const name = newName.trim();
    if (!name) return;

    setBusy("add");
    setError(null);
    try {
      await callApi("/api/shopping-list/manual", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setNewName("");
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function syncDerived() {
    setBusy("sync");
    setError(null);
    try {
      await callApi("/api/shopping-list/sync-derived", { method: "POST" });
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function clearChecked() {
    setBusy("clear");
    setError(null);
    try {
      await callApi("/api/shopping-list/clear-checked", { method: "POST" });
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleChecked(id: string, checked: boolean) {
    setBusy(id);
    setError(null);
    try {
      await callApi(`/api/shopping-list/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ checked }),
      });
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  function startEdit(item: Item) {
    setEditingId(item.id);
    setEditingValue(item.name);
  }

  async function saveEdit(id: string) {
    const name = editingValue.trim();
    if (!name) {
      setError("Name cannot be empty.");
      return;
    }

    setBusy("save");
    setError(null);
    try {
      await callApi(`/api/shopping-list/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setEditingId(null);
      setEditingValue("");
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteItem(id: string) {
    setBusy("delete");
    setError(null);
    try {
      await callApi(`/api/shopping-list/${id}`, { method: "DELETE" });
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 18px" }}>
      <h1 style={{ fontSize: 56, margin: 0, lineHeight: 1.05 }}>Shopping List</h1>
      <p style={{ opacity: 0.75, marginTop: 10 }}>
        One list. Manual + derived. Calm and predictable.
      </p>

      {error ? (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 12, border: "1px solid #f3b3b3", background: "#fff0f0" }}>
          <b>Error</b>
          <div style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 18 }}>
        <button onClick={syncDerived} disabled={!!busy}>
          {busy === "sync" ? "Syncing..." : "Sync derived items"}
        </button>
        <button onClick={clearChecked} disabled={!!busy}>
          {busy === "clear" ? "Clearing..." : "Clear checked"}
        </button>

        <div style={{ marginLeft: "auto", opacity: 0.7 }}>
          Derived: {counts.derived} &nbsp; Manual: {counts.manual}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder='Add manual item (e.g. "milk")'
          style={{ flex: 1, padding: 14, borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", fontSize: 16 }}
          onKeyDown={(e) => e.key === "Enter" && addManual()}
          disabled={!!busy}
        />
        <button onClick={addManual} disabled={!!busy || !newName.trim()}>
          {busy === "add" ? "Adding..." : "Add"}
        </button>
      </div>

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        {items.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Nothing here yet. Add an item or sync derived.</div>
        ) : (
          items.map((it) => {
            const isEditing = editingId === it.id;

            return (
              <div key={it.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: 14, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 14 }}>
                <input
                  type="checkbox"
                  checked={!!it.checked}
                  disabled={!!busy}
                  onChange={(e) => toggleChecked(it.id, e.target.checked)}
                />

                <div style={{ flex: 1 }}>
                  {isEditing ? (
                    <input
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      disabled={!!busy}
                      style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)" }}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit(it.id)}
                    />
                  ) : (
                    <div style={{ fontSize: 20, fontWeight: 700, opacity: it.checked ? 0.55 : 1 }}>
                      {it.name} <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.5 }}>{it.source_type}</span>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <>
                    <button onClick={() => saveEdit(it.id)} disabled={!!busy}>Save</button>
                    <button onClick={() => { setEditingId(null); setEditingValue(""); }} disabled={!!busy}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(it)} disabled={!!busy}>Edit</button>
                    <button onClick={() => deleteItem(it.id)} disabled={!!busy}>Delete</button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
