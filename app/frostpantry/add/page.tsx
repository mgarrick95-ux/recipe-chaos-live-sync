"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

function todayAsDateInput() {
  // yyyy-mm-dd for <input type="date">
  const d = new Date();
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AddItemPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  // On mount, default "stored_on" to today if empty
  useEffect(() => {
    setForm((prev) =>
      prev.stored_on
        ? prev
        : {
            ...prev,
            stored_on: todayAsDateInput(),
          }
    );
  }, []);

  function handleChange(
    field: keyof typeof form,
    value: string | number | boolean
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/storage-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          stored_on: form.stored_on || null,
          use_by: form.use_by || null,
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error || "Failed to add item");
      }

      router.push("/frostpantry");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? "Failed to add item");
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

        <h1 className="mt-4 text-3xl font-bold mb-2">Add item</h1>
        <p className="text-sm text-gray-400 mb-4">
          Quick add for whatever you just shoved into the freezer, fridge, or
          pantry.
        </p>

        {errorMsg && (
          <div className="mb-4 rounded bg-red-800/80 px-4 py-2 text-sm">
            {errorMsg}
          </div>
        )}

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
                onChange={(e) => handleChange("stored_on", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Use by (optional)</label>
              <input
                type="date"
                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                value={form.use_by}
                onChange={(e) => handleChange("use_by", e.target.value)}
              />
            </div>
          </div>

          {/* advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-gray-300 flex items-center gap-1"
          >
            <span
              className={`inline-block transition-transform ${
                showAdvanced ? "rotate-90" : ""
              }`}
            >
              ▶
            </span>
            <span>{showAdvanced ? "Hide extras" : "More details"}</span>
          </button>

          {showAdvanced && (
            <div className="space-y-3 border-t border-slate-800 pt-3">
              <div className="flex items-center gap-2">
                <input
                  id="is_leftover"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.is_leftover}
                  onChange={(e) =>
                    handleChange("is_leftover", e.target.checked)
                  }
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
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-3 inline-flex items-center justify-center rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 px-6 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save to FrostPantry"}
          </button>
        </form>
      </div>
    </div>
  );
}
