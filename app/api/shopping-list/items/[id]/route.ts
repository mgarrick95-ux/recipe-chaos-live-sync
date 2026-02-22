// app/api/shopping-list/items/[id]/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { normalizeShoppingListIdentifier } from "@/lib/shopping/normalize";

export const dynamic = "force-dynamic";

function supabaseFromCookies() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );
}

function supabaseFromBearer(authHeader: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );
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

function coerceQuantityToText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.max(1, Math.floor(value)));
  }
  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return String(Math.max(1, Math.floor(n)));
    return "1";
  }
  return "1";
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const { supabase, user, authErr } = await getAuthedSupabase(req);

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const id = String(ctx?.params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: any = {};
  if (typeof body?.checked === "boolean") update.checked = body.checked;
  if (typeof body?.dismissed === "boolean") update.dismissed = body.dismissed;
  if (body?.quantity !== undefined) update.quantity = coerceQuantityToText(body.quantity);

  if (typeof body?.name === "string") {
    const nextNameRaw = body.name.trim();
    if (!nextNameRaw) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    const ident = normalizeShoppingListIdentifier(nextNameRaw);
    if (!ident.displayName || !ident.normalizedName) {
      return NextResponse.json(
        { error: "Please enter a product name." },
        { status: 400 }
      );
    }

    update.name = ident.displayName;
    update.normalized_name = ident.normalizedName;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("shopping_list_items")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ item: data });
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const { supabase, user, authErr } = await getAuthedSupabase(req);

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const id = String(ctx?.params?.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}