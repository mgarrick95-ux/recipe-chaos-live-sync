// app/api/receipt/parse/route.ts
import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";

type ParsedReceiptItem = {
  name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
};

function isProbablyItemLine(line: string) {
  const s = line.trim();
  if (!s) return false;
  if (s.length < 2) return false;

  // ignore totals/headers-ish stuff
  if (/^(total|subtotal|tax|change|cash|visa|mastercard|balance|tender|amount)\b/i.test(s)) return false;
  if (/^\$?\d+(\.\d{2})\s*$/i.test(s)) return false;

  // must contain letters
  return /[a-zA-Z]/.test(s);
}

function parseTextToItems(raw: string): ParsedReceiptItem[] {
  // Very basic heuristic parser. Good enough to produce editable rows.
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(isProbablyItemLine);

  const items: ParsedReceiptItem[] = [];

  for (const line of lines) {
    // Common patterns:
    // "2 x MILK"
    // "MILK 2"
    // "MILK"
    let quantity = 1;
    let name = line;

    const m1 = line.match(/^\s*(\d+)\s*[x×]\s*(.+)$/i);
    if (m1) {
      quantity = Math.max(1, Number(m1[1]));
      name = m1[2].trim();
    } else {
      const m2 = line.match(/^\s*(\d+)\s+(.+)$/i);
      if (m2) {
        quantity = Math.max(1, Number(m2[1]));
        name = m2[2].trim();
      } else {
        const m3 = line.match(/^(.+?)\s+[x×]\s*(\d+)\s*$/i);
        if (m3) {
          name = m3[1].trim();
          quantity = Math.max(1, Number(m3[2]));
        } else {
          const m4 = line.match(/^(.+?)\s+(\d+)\s*$/i);
          if (m4) {
            name = m4[1].trim();
            quantity = Math.max(1, Number(m4[2]));
          }
        }
      }
    }

    if (!name) continue;

    // Optional: strip trailing price fragments like "$3.99"
    name = name.replace(/\s+\$?\d+(\.\d{2})\s*$/g, "").trim();

    items.push({ name, quantity });
  }

  // De-dupe identical consecutive lines (some receipts repeat)
  const deduped: ParsedReceiptItem[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const key = `${(it.name || "").toLowerCase()}::${it.quantity || 1}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }

  return deduped.slice(0, 120);
}

async function fileToText(file: File): Promise<string> {
  const mime = (file.type || "").toLowerCase();
  const ab = await file.arrayBuffer();
  const buf = Buffer.from(ab);

  // PDF
  if (mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const parsed = await pdfParse(buf);
    return (parsed.text || "").trim();
  }

  // Treat as text-ish by default
  // (If someone uploads a .png, this will be garbage — but we’ll error cleanly.)
  const text = buf.toString("utf8").trim();
  return text;
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    // JSON: { text }
    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => null)) as any;
      const text = String(body?.text || "").trim();
      if (!text) {
        return NextResponse.json({ error: "Missing text" }, { status: 400 });
      }

      const items = parseTextToItems(text);
      if (items.length === 0) {
        return NextResponse.json(
          { error: "Couldn’t find any item-like lines in that text.", items: [] },
          { status: 200 }
        );
      }

      return NextResponse.json({ items }, { status: 200 });
    }

    // Multipart: files
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const files = form.getAll("files").filter(Boolean) as File[];
      if (!files || files.length === 0) {
        return NextResponse.json({ error: "No files provided" }, { status: 400 });
      }

      const texts: string[] = [];
      for (const f of files) {
        const t = await fileToText(f);
        texts.push(t);
      }

      const joined = texts.join("\n\n").trim();
      if (!joined) {
        return NextResponse.json(
          { error: "That file had no readable text. If it’s a scanned receipt, it needs OCR.", items: [] },
          { status: 400 }
        );
      }

      const items = parseTextToItems(joined);
      if (items.length === 0) {
        return NextResponse.json(
          { error: "Couldn’t find any item-like lines in that file.", items: [] },
          { status: 200 }
        );
      }

      return NextResponse.json({ items }, { status: 200 });
    }

    return NextResponse.json(
      { error: "Unsupported content type. Use JSON {text} or multipart files." },
      { status: 415 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Receipt parse failed" }, { status: 500 });
  }
}
