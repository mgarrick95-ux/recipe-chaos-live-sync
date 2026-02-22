// lib/supabaseServer.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * ✅ Admin client (SERVICE ROLE) — use ONLY in server route handlers where you truly need it.
 * DO NOT import into client components.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

export const supabaseServerAdmin = createClient(url, serviceRole, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

/**
 * ✅ Authed server client for App Router Route Handlers.
 * Reads auth from:
 *  - Authorization: Bearer <jwt>  (mobile-friendly)
 *  - OR Next.js cookies (web SSR-friendly)
 *
 * Use this in routes where you want "the logged-in user" (RLS enforced).
 */
export function createSupabaseServerClient(request?: Request) {
  const authHeader =
    request?.headers.get("authorization") ||
    request?.headers.get("Authorization") ||
    "";

  const hasBearer = authHeader.toLowerCase().startsWith("bearer ");

  // If a bearer token exists, create a client that uses it.
  if (hasBearer) {
    return createClient(url, anon, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
  }

  // Otherwise, use cookies (web / browser) — MUST match middleware (getAll/setAll).
  const cookieStore = cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set({ name, value, ...options });
        });
      },
    },
  });
}