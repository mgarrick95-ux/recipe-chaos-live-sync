"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Read from NEXT_PUBLIC_ env vars so both server and browser see the same values
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Simple flag for the UI
export const hasSupabase = Boolean(supabaseUrl && supabaseAnonKey);

let client: SupabaseClient | null = null;

if (hasSupabase) {
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // we don't need user auth for this simple app
      persistSession: false,
    },
  });
}

// Export a single shared client (or null if not configured)
export const supabase = client;
