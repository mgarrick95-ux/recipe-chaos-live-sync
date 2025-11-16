"use client";

import React, { useEffect, useState } from "react";
import { cosineSim, textForEmbedding } from "./util";
import { hasSupabase } from "../lib/supabaseClient";
import {
  loadAll,
  upsertPantry,
  deletePantry,
  upsertFreezer,
  deleteFreezer,
  addReservation,
  removeReservation,
  subscribeRealtime,
  Stock,
  Reservation,
} from "../lib/sync";

export default function HomePage() {
  const [pantry, setPantry] = useState<Stock[]>([]);
  const [freezer, setFreezer] = useState<Stock[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  // If Supabase isn’t configured, just show message (same on server & client)
  if (!hasSupabase) {
    return (
      <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>RecipeChaos + FrostPantry</h1>
        <p>Supabase is not configured. Check your .env.local file.</p>
      </main>
    );
  }

  useEffect(() => {
    async function init() {
      const { pantry, freezer, reservations } = await loadAll();
      setPantry(pantry);
      setFreezer(freezer);
      setReservations(reservations);
      setLoading(false);
    }
    init();

    const unsubscribe = subscribeRealtime({
      onPantry: setPantry,
      onFreezer: setFreezer,
      onReservations: setReservations,
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>RecipeChaos + FrostPantry</h1>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>RecipeChaos + FrostPantry</h1>

      <section>
        <h2>Pantry</h2>
        <ul>
          {pantry.map((item) => (
            <li key={item.id}>
              {item.name} — {item.qty} {item.unit}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Freezer</h2>
        <ul>
          {freezer.map((item) => (
            <li key={item.id}>
              {item.name} — {item.qty} {item.unit}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Reservations</h2>
        <ul>
          {reservations.map((r) => (
            <li key={r.id}>
              {r.date} — {r.name} ({r.qty})
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
