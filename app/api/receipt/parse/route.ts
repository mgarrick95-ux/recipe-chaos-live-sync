// app/api/receipt/parse/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ParsedReceiptItem = {
  name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
};

function normLine(line: string) {
  return (line || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikePriceOnly(s: string) {
  return /^\$?\s*\d+(\.\d{2})\s*$/.test(s);
}

function isJunkLine(s: string) {
  const t = s.trim();
  if (!t) return true;
  if (t.length < 2) return true;

  const lower = t.toLowerCase();

  const exactJunk = new Set([
    "qty",
    "quantity",
    "add",
    "remove",
    "write a review",
    "reward logo",
    "rewards",
    "points",
    "subtotal",
    "total",
    "tax",
    "hst",
    "gst",
    "pst",
    "tip",
    "change",
    "cash",
    "visa",
    "mastercard",
    "amex",
    "debit",
    "credit",
    "balance",
    "tender",
    "amount",
    "order summary",
    "order details",
  ]);
  if (exactJunk.has(lower)) return true;

  if (
    /(write a review|return eligible|delivered|shipping|pickup|substitution|substituted|out of stock|out-of-stock|sold by|fulfilled by|customer service|support|thanks for your order)/i.test(
      t
    )
  )
    return true;

  if (
    /(discount price|was\s+\$?\d|you saved|from savings|from discounts|coupon|promo|promotion|deal|rollback|price drop)/i.test(
      t
    )
  )
    return true;

  if (looksLikePriceOnly(t)) return true;

  if (/^[\d\$\.\-\+\(\)\s]+$/.test(t)) return true;

  if (!/[a-zA-Z]/.test(t)) return true;

  return false;
}

function stripTrailingPrice(name: string) {
  return name.replace(/\s+\$?\d+(\.\d{2})\s*$/g, "").trim();
}

function parseTextToItems(raw: string): ParsedReceiptItem[] {
  const lines = raw
    .split(/\r?\n/)
    .map(normLine)
    .filter((l) => !isJunkLine(l));

  const items: ParsedReceiptItem[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
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

    name = stripTrailingPrice(name);
    if (!name || isJunkLine(name)) continue;

    const key = `${name.toLowerCase()}::${quantity}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({ name, quantity });
    if (items.length >= 160) break;
  }

  return items;
}

function printableRatio(text: string) {
  if (!text) return 0;
  let printable = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126)) printable++;
  }
  return printable / Math.max(1, text.length);
}

async function fileToText(file: File): Promise<{ text: string; kind: string }> {
  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  const ab = await file.arrayBuffer();
  const buf = Buffer.from(ab);

  // Images: OCR not wired (yet)
  if (mime.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|heic)$/i.test(name)) {
    return { text: "", kind: "image" };
  }

  // PDFs: dynamic import so pdf-parse can’t crash the module for paste-mode
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    try {
      const mod: any = await import("pdf-parse");
      const pdfParse = mod?.default ?? mod;
      const parsed = await pdfParse(buf);
      const text = String(parsed?.text || "").trim();
      return { text, kind: "pdf" };
    } catch (e) {
      console.error("[receipt/parse] pdf-parse failed:", e);
      return { text: "", kind: "pdf_error" };
    }
  }

  // Text-ish: decode and reject obvious binary
  const text = buf.toString("utf8").trim();
  if (!text) return { text: "", kind: "empty" };

  if (printableRatio(text) < 0.75) {
    return { text: "", kind: "binary" };
  }

  return { text, kind: "text" };
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";

  try {
    // JSON: { text }
    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => null)) as any;
      const text = String(body?.text || "").trim();

      if (!text) {
        return NextResponse.json(
          { items: [], error: "Missing text", debug: { mode: "json", contentType } },
          { status: 400 }
        );
      }

      const items = parseTextToItems(text);

      // IMPORTANT: never 500 for “no items found”
      if (items.length === 0) {
        return NextResponse.json(
          {
            items: [],
            message: "I couldn’t find item-like lines in that text.",
            debug: { mode: "json", extractedTextChars: text.length, contentType },
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        { items, debug: { mode: "json", extractedTextChars: text.length, contentType } },
        { status: 200 }
      );
    }

    // Multipart: files
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const files = form.getAll("files").filter(Boolean) as File[];

      if (!files || files.length === 0) {
        return NextResponse.json(
          {
            items: [],
            error: "No files provided",
            debug: { mode: "multipart", contentType, receivedFormKeys: Array.from(form.keys()) },
          },
          { status: 400 }
        );
      }

      const texts: string[] = [];
      const kinds: string[] = [];

      for (const f of files) {
        const r = await fileToText(f);
        kinds.push(r.kind);
        if (r.text) texts.push(r.text);
      }

      const joined = texts.join("\n\n").trim();

      // ✅ Fully wired behavior: scanned/malformed PDFs/images return 200 + message, never 500
      if (!joined) {
        const isImage = kinds.some((k) => k === "image");
        const isPdf = kinds.some((k) => k === "pdf" || k === "pdf_error");
        const msg = isImage
          ? "That looks like an image receipt. OCR isn’t wired yet, so I can’t read it."
          : isPdf
            ? "I couldn’t read text from that PDF. If it’s scanned, OCR isn’t wired yet. If it’s a normal PDF, it may be malformed."
            : "I couldn’t read text from that file. If it’s a scan/image, OCR isn’t wired yet.";

        return NextResponse.json(
          {
            items: [],
            message: msg,
            debug: {
              mode: "multipart",
              fileCount: files.length,
              kinds,
              extractedTextChars: 0,
              contentType,
              receivedFormKeys: Array.from(form.keys()),
            },
          },
          { status: 200 }
        );
      }

      const items = parseTextToItems(joined);

      if (items.length === 0) {
        return NextResponse.json(
          {
            items: [],
            message: "I pulled text from that file, but none of it looked like item lines.",
            debug: {
              mode: "multipart",
              fileCount: files.length,
              kinds,
              extractedTextChars: joined.length,
              contentType,
              receivedFormKeys: Array.from(form.keys()),
            },
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        {
          items,
          debug: {
            mode: "multipart",
            fileCount: files.length,
            kinds,
            extractedTextChars: joined.length,
            contentType,
            receivedFormKeys: Array.from(form.keys()),
          },
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { items: [], error: "Unsupported content type. Use JSON {text} or multipart files.", debug: { contentType } },
      { status: 415 }
    );
  } catch (e: any) {
    console.error("[receipt/parse] fatal error:", e);
    return NextResponse.json(
      { items: [], error: e?.message || "Receipt parse failed", debug: { contentType } },
      { status: 500 }
    );
  }
}
