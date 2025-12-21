// lib/supabaseClient.ts
"use client";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// This MUST be a SupabaseClient instance (object with .from, .auth, etc.)
export const supabase = createClient(url, anon);

// Keep compatibility for any old imports
export const hasSupabase = Boolean(url && anon);
