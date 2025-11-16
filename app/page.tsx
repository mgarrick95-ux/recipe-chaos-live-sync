"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type PantryItem = {
  id: string;
  name: string | null;
  quantity: number | null;
  unit: string | null;
};

type FreezerItem = {
  id: string;
  name: string | null;
  quantity: number | null;
  unit: string | null;
};

type Reservation = {
  id: string;
  name: string | null;
  date?: string | null;
  notes?: string | null;
};

const TABS = ["pantry", "freezer", "reservations"] as const;
type Tab = (typeof TABS)[number];

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("pantry");

  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [freezerItems, setFreezerItems] = useState<FreezerItem[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load data from Supabase whenever the active tab changes
  useEffect(() => {
    async function load() {
      setError(null);
      setLoading(true);

      try {
        if (activeTab === "pantry") {
          const { data, error } = await supabase
            .from("pantry_items")
            .select("id, name, quantity, unit")
            .order("name", { ascending: true });

          if (error) throw error;
          setPantryItems(data ?? []);
        } else if (activeTab === "freezer") {
          const { data, error } = await supabase
            .from("freezer_items")
            .select("id, name, quantity, unit")
            .order("name", { ascending: true });

          if (error) throw error;
          setFreezerItems(data ?? []);
        } else if (activeTab === "reservations") {
          // Be loose here in case your reservations table changes later
          const { data, error } = await supabase
            .from("reservations")
            .select("*")
            .order("id", { ascending: true });

          if (error) throw error;
          setReservations(data ?? []);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [activeTab]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">RecipeChaos</h1>
          <p className="mt-2 text-slate-300">
            AI-assisted meal planning that actually respects your pantry &amp;
            freezer.
          </p>
        </header>

        <section className="rounded-2xl bg-slate-900/60 px-8 py-10 shadow-lg ring-1 ring-slate-800">
          <h2 className="text-4xl font-bold tracking-tight mb-6">
            RecipeChaos + FrostPantry
          </h2>

          {/* Tabs */}
          <div className="mb-6 flex gap-6 border-b border-slate-800 pb-2 text-sm font-medium">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`border-b-2 pb-1 capitalize transition ${
                  activeTab === tab
                    ? "border-sky-400 text-sky-300"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Content area */}
          <div>
            {activeTab === "pantry" && (
              <>
                <h3 className="text-xl font-semibold mb-3">Pantry</h3>

                {loading && <p className="text-slate-300">Loading pantry…</p>}
                {error && (
                  <p className="text-red-400">
                    Error loading pantry: {error}
                  </p>
                )}

                {!loading && !error && pantryItems.length === 0 && (
                  <p className="text-slate-300">
                    No pantry items yet. Try adding one in Supabase
                    (public.pantry_items) and refresh.
                  </p>
                )}

                <ul className="mt-4 space-y-2">
                  {pantryItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between rounded-lg bg-slate-900/80 px-4 py-2 text-sm"
                    >
                      <span>{item.name ?? "Unnamed item"}</span>
                      <span className="text-slate-300">
                        {item.quantity ?? "?"}{" "}
                        {item.unit ? item.unit : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {activeTab === "freezer" && (
              <>
                <h3 className="text-xl font-semibold mb-3">Freezer</h3>

                {loading && <p className="text-slate-300">Loading freezer…</p>}
                {error && (
                  <p className="text-red-400">
                    Error loading freezer: {error}
                  </p>
                )}

                {!loading && !error && freezerItems.length === 0 && (
                  <p className="text-slate-300">
                    No freezer items yet. Add some rows to
                    public.freezer_items and refresh.
                  </p>
                )}

                <ul className="mt-4 space-y-2">
                  {freezerItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between rounded-lg bg-slate-900/80 px-4 py-2 text-sm"
                    >
                      <span>{item.name ?? "Unnamed item"}</span>
                      <span className="text-slate-300">
                        {item.quantity ?? "?"}{" "}
                        {item.unit ? item.unit : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {activeTab === "reservations" && (
              <>
                <h3 className="text-xl font-semibold mb-3">Reservations</h3>

                {loading && (
                  <p className="text-slate-300">Loading reservations…</p>
                )}
                {error && (
                  <p className="text-red-400">
                    Error loading reservations: {error}
                  </p>
                )}

                {!loading && !error && reservations.length === 0 && (
                  <p className="text-slate-300">
                    No reservations yet. We can design this table together
                    later.
                  </p>
                )}

                <ul className="mt-4 space-y-2">
                  {reservations.map((res) => (
                    <li
                      key={res.id}
                      className="rounded-lg bg-slate-900/80 px-4 py-2 text-sm"
                    >
                      <div className="font-medium">
                        {res.name ?? "Reservation"}
                      </div>
                      {res.date && (
                        <div className="text-slate-300 text-xs">
                          {res.date}
                        </div>
                      )}
                      {res.notes && (
                        <div className="text-slate-400 text-xs mt-1">
                          {res.notes}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
