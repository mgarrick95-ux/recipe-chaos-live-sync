"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type StorageItem = {
  id: string;
  name: string;
  location: string;
  quantity: number;
  unit: string;
  stored_on: string | null;
  use_by: string | null;
  is_leftover: boolean;
  notes: string | null;
};

export default function EditItemPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [form, setForm] = useState({
    name: "",
    location: "Freezer",
    quantity: 1,
    unit: "cube",
    stored_on: "",
    use_by: "",
    is_leftover: false,
    notes: "",
  });

  function handleChange(
    field: keyof typeof form,
    value: string | number | boolean
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  useEffect(() => {
    if (!id) return;

    async function loadItem() {
      setLoading(true);
      setErrorMsg("");

      try {
        const res = await fetch(`/api/storage-items/${id}`);
        const json = await res.json();

        if (!json.ok) {
          throw new Error(json.error || "Failed to load item");
        }

        const item: StorageItem = json.item;

        setForm({
          name: item.name ?? "",
          location: item.location ?? "Freezer",
          quantity: item.quantity ?? 1,
          unit: item.unit ?? "cube",
          stored_on: item.stored_on ?? "",
          use_by: item.use_by ?? "",
          is_leftover: !!item.is_leftover,
          notes: item.notes ?? "",
        });
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err?.message ?? "Failed to load item");
      } finally {
        setLoading(false);
      }
    }

    loadItem();
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;

    setSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/storage-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          stored_on: form.stored_on || null,
          use_by: form.use_by || null,
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || "Failed to update item");
      }

      router.push("/frostpantry");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? "Failed to update item");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Link href="/frostpantry" className="text-sm text-gray-400">
          ← Back to FrostPantry
        </Link>

        <h1 className="mt-4 text-3xl font-bold mb-2">Edit item</h1>

        {errorMsg && (
          <div className="mb-4 rounded bg-red-800/80 px-4 py-2 text-sm">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <p className="text-gray-400">Loading item…</p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 bg-[#050b1e] border border-slate-800 rounded-xl p-4"
          >
            {/* name */}
            <div>
              <label className="block text-sm mb-1">Item name</label>
              <input
                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                required
              />
            </div>

            {/* location + qty + unit */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
              <div>
                <label className="block text-sm mb-1">Location</label>
                <select
                  className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                  value={form.location}
                  onChange={(e) => handleChange("location", e.target.value)}
                >
                  <option>Freezer</option>
                  <option>Fridge</option>
                  <option>Pantry</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Quantity</label>
                <input
                  type="number"
                  min={0}
                  className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                  value={form.quantity}
                  onChange={(e) =>
                    handleChange("quantity", Number(e.target.value) || 0)
                  }
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Unit</label>
                <select
                  className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                  value={form.unit}
                  onChange={(e) => handleChange("unit", e.target.value)}
                >
                  <option value="cube">cube</option>
                  <option value="portion">portion</option>
                  <option value="bag">bag</option>
                  <option value="container">container</option>
                  <option value="other">other</option>
                </select>
              </div>
            </div>

            {/* dates */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div>
                <label className="block text-sm mb-1">Stored on</label>
                <input
                  type="date"
                  className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                  value={form.stored_on}
                  onChange={(e) =>
                    handleChange("stored_on", e.target.value || "")
                  }
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Use by (optional)</label>
                <input
                  type="date"
                  className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                  value={form.use_by}
                  onChange={(e) => handleChange("use_by", e.target.value || "")}
                />
              </div>
            </div>

            {/* leftover + notes */}
            <div className="flex items-center gap-2">
              <input
                id="is_leftover"
                type="checkbox"
                className="h-4 w-4"
                checked={form.is_leftover}
                onChange={(e) => handleChange("is_leftover", e.target.checked)}
              />
              <label htmlFor="is_leftover" className="text-sm">
                Mark as leftover
              </label>
            </div>

            <div>
              <label className="block text-sm mb-1">Notes (optional)</label>
              <textarea
                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                rows={3}
                value={form.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex items-center justify-center rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 px-6 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save changes"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
