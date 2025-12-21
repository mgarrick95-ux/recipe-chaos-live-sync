// lib/supabaseServer.ts
import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client (SERVICE ROLE) for Route Handlers only.
// IMPORTANT: do NOT import this into "use client" components.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

export const supabaseServer = createClient(url, serviceRole, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
