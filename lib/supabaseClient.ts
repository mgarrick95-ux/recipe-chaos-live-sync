// lib/supabaseClient.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

// Cookie-based browser client (recommended for Next + SSR/API routes).
// This makes server route handlers see the logged-in user.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");

export const supabase = createBrowserClient(url, anon);

// Keep compatibility for any old imports
export const hasSupabase = Boolean(url && anon);
