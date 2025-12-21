// app/api/recipes/clip/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type ClipRecipeBody = {
  url?: string;
  title?: string;
};

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function deriveTitleFromUrl(urlStr: string): { title: string; sourceName: string | null } {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.replace(/^www\./, "");
    return {
      title: `Clipped recipe (${host})`,
      sourceName: host || null,
    };
  } catch {
    return { title: "Clipped recipe", sourceName: null };
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ClipRecipeBody;

    const sourceUrl = safeTrim(body.url);
    let title = safeTrim(body.title);

    // Web Clip rules:
    // - URL is optional, but recommended
    // - Title is required in DB (assumed), so we derive one if blank
    let derivedSourceName: string | null = null;

    if (!title) {
      const derived = deriveTitleFromUrl(sourceUrl);
      title = derived.title;
      derivedSourceName = derived.sourceName;
    }

    // If still no title, hard stop (shouldn't happen)
    if (!title) {
      return NextResponse.json(
        { error: "Title is required." },
        { status: 400 }
      );
    }

    // URL is optional; if provided, validate it doesn’t crash URL parsing
    if (sourceUrl) {
      try {
        // eslint-disable-next-line no-new
        new URL(sourceUrl);
      } catch {
        return NextResponse.json(
          { error: "Please enter a valid URL (including https://)." },
          { status: 400 }
        );
      }
    }

    // Insert a minimal recipe row.
    // Keep this as light as possible to avoid mismatching your existing schema.
    // If your table has other required columns, add defaults here.
    const insertPayload: Record<string, any> = {
      title,
      source_url: sourceUrl || null,
      source_name: derivedSourceName,
    };

    const { data, error } = await supabaseServer
      .from("recipes")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Failed to create clipped recipe." },
        { status: 500 }
      );
    }

    return NextResponse.json({ id: data.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unexpected error." },
      { status: 500 }
    );
  }
}
