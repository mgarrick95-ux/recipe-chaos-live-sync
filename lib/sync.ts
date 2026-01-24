"use client";

import { supabase, hasSupabase } from "@/lib/supabaseClient";
export { supabase, hasSupabase };

export type Stock = { id: string; name: string; qty: number; unit?: string };
export type Reservation = {
  id?: string;
  item_id: string;
  name: string;
  qty: number;
  unit?: string;
  date: string;
  recipe?: string;
  location: "Pantry" | "Freezer";
  status?: string;
};

function emptyResult() {
  return {
    pantry: [] as Stock[],
    freezer: [] as Stock[],
    reservations: [] as Reservation[],
  };
}

export async function loadAll() {
  if (!hasSupabase || !supabase) {
    console.warn("Supabase not configured, returning empty data.");
    return emptyResult();
  }

  const [pantryRes, freezerRes, reservationsRes] = await Promise.all([
    supabase.from("pantry").select("*").order("name"),
    supabase.from("freezer").select("*").order("name"),
    supabase.from("reservations").select("*").order("date"),
  ]);

  return {
    pantry: (pantryRes.data || []) as Stock[],
    freezer: (freezerRes.data || []) as Stock[],
    reservations: (reservationsRes.data || []) as Reservation[],
  };
}

export async function upsertPantry(item: Omit<Stock, "id"> & Partial<Stock>) {
  if (!hasSupabase || !supabase) return;
  await supabase.from("pantry").upsert(item, { onConflict: "id" });
}

export async function deletePantry(id: string) {
  if (!hasSupabase || !supabase) return;
  await supabase.from("pantry").delete().eq("id", id);
}

export async function upsertFreezer(item: Omit<Stock, "id"> & Partial<Stock>) {
  if (!hasSupabase || !supabase) return;
  await supabase.from("freezer").upsert(item, { onConflict: "id" });
}

export async function deleteFreezer(id: string) {
  if (!hasSupabase || !supabase) return;
  await supabase.from("freezer").delete().eq("id", id);
}

export async function addReservation(res: Reservation) {
  if (!hasSupabase || !supabase) return;
  await supabase.from("reservations").insert(res);
}

export async function removeReservation(id: string) {
  if (!hasSupabase || !supabase) return;
  await supabase.from("reservations").delete().eq("id", id);
}

type RealtimeHandlers = {
  onPantry: (items: Stock[]) => void;
  onFreezer: (items: Stock[]) => void;
  onReservations: (items: Reservation[]) => void;
};

export function subscribeRealtime(handlers: RealtimeHandlers) {
  if (!hasSupabase || !supabase) return () => {};

  const channel = supabase
    .channel("recipechaos-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "pantry" }, async () => {
      const { data } = await supabase.from("pantry").select("*").order("name");
      handlers.onPantry((data || []) as Stock[]);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "freezer" }, async () => {
      const { data } = await supabase.from("freezer").select("*").order("name");
      handlers.onFreezer((data || []) as Stock[]);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, async () => {
      const { data } = await supabase.from("reservations").select("*").order("date");
      handlers.onReservations((data || []) as Reservation[]);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
