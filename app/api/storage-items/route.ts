// app/api/storage-items/route.ts
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ROUTE_PATH = "/api/storage-items";

function getSupabaseEnv() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

function getBearerHeaderIfValid(req: Request): string | null {
  const raw =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    "";
  if (!raw) return null;

  const parts = raw.trim().split(/\s+/);
  if (parts.length < 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;

  const token = parts.slice(1).join(" ").trim();
  if (!token || token === "null" || token === "undefined") return null;
  if (token.length < 20) return null;

  return `Bearer ${token}`;
}

function supabaseFromCookies() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  const cookieStore = cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
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

function supabaseFromBearer(authHeader: string) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

  return createClient(supabaseUrl, supabaseAnonKey, {
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

async function getAuthedSupabase(req: Request) {
  const bearer = getBearerHeaderIfValid(req);

  if (bearer) {
    const supabase = supabaseFromBearer(bearer);
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (!authErr && user) return { supabase, user, authErr: null };

    const supabaseCookie = supabaseFromCookies();
    const {
      data: { user: user2 },
      error: authErr2,
    } = await supabaseCookie.auth.getUser();

    return { supabase: supabaseCookie, user: user2, authErr: authErr2 };
  }

  const supabase = supabaseFromCookies();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  return { supabase, user, authErr };
}

export async function GET(req: Request) {
  try {
    const { supabase, user, authErr } = await getAuthedSupabase(req);

    if (authErr || !user) {
      return NextResponse.json(
        { error: `401 ${ROUTE_PATH}: Not authenticated.` },
        { status: 401 }
      );
    }

    const { data: items, error } = await supabase
      .from("storage_items")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          error: `500 ${ROUTE_PATH}: Failed to load storage items (${error.message}).`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ items: items ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: `500 ${ROUTE_PATH}: ${e?.message || "Unexpected error"}` },
      { status: 500 }
    );
  }
}