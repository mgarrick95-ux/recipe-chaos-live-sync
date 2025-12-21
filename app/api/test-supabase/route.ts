import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Hard-coded project URL to avoid any env formatting issues
const SUPABASE_URL = "https://vxymjngdejgrzhmumlyg.supabase.co";

export async function GET() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    return NextResponse.json(
      {
        ok: false,
        step: "check_env",
        error:
          "SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local and restart dev server.",
      },
      { status: 500 }
    );
  }

  try {
    const supabase = createClient(SUPABASE_URL, serviceRoleKey);

    // Simple test query
    const { data, error } = await supabase
      .from("recipe_cards")
      .select("id, title")
      .limit(1);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          step: "supabase_query",
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Supabase connection successful 🎉",
        sample: data,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        step: "unexpected_catch",
        error: err?.message || "Unknown error",
        urlUsed: SUPABASE_URL,
      },
      { status: 500 }
    );
  }
}
