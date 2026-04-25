// app/api/receipt/parse/route.ts
import { NextResponse } from "next/server";
import { getModel, getOpenAIClient } from "@/lib/openaiServer";

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
  ) {
    return true;
  }

  if (
    /(discount price|was\s+\$?\d|you saved|from savings|from discounts|coupon|promo|promotion|deal|rollback|price drop)/i.test(
      t
    )
  ) {
    return true;
  }

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

function guessMimeFromName(name: string) {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  return "application/octet-stream";
}

async function imageToTextWithOpenAI(file: File): Promise<string> {
  const client = getOpenAIClient();
  const mime = (file.type || guessMimeFromName(file.name || "")).toLowerCase();
  const ab = await file.arrayBuffer();
  const base64 = Buffer.from(ab).toString("base64");
  const dataUrl = `data:${mime};base64,${base64}`;

  const response = await client.responses.create({
    model: getModel("smart"),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Read this grocery receipt image and return only likely purchased grocery or household item lines as plain text, one item per line. " +
              "Do not include store name, address, phone number, dates, times, cashier info, loyalty text, payment method, subtotal, tax, total, change, thank-you text, promo text, or other receipt junk. " +
              "Keep only the purchased product lines. Do not explain. Do not summarize. Do not format as JSON.",
          },
          {
            type: "input_image",
            image_url: dataUrl,
            detail: "auto",
          },
        ],
      },
    ],
  });

  const text = String((response as any).output_text || "").trim();
  return text;
}

async function fileToText(file: File): Promise<{ text: string; kind: string }> {
  const mime = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  const ab = await file.arrayBuffer();
  const buf = Buffer.from(ab);

  if (mime.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif|heic)$/i.test(name)) {
    try {
      const text = await imageToTextWithOpenAI(file);
      return { text, kind: text ? "image_ocr" : "image_ocr_empty" };
    } catch (e) {
      console.error("[receipt/parse] image OCR failed:", e);
      return { text: "", kind: "image_ocr_error" };
    }
  }

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

      if (items.length === 0) {
        return NextResponse.json(
          {
            items: [],
            message: "I couldn't find item-like lines in that text.",
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

      if (!joined) {
        const isImage = kinds.some((k) => k.startsWith("image"));
        const isPdf = kinds.some((k) => k === "pdf" || k === "pdf_error");
        const msg = isImage
          ? "I tried OCR on that image, but couldn't pull usable receipt text."
          : isPdf
            ? "I couldn't read text from that PDF. If it's scanned, OCR may still be needed. If it's a normal PDF, it may be malformed."
            : "I couldn't read text from that file.";

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
      {
        items: [],
        error: "Unsupported content type. Use JSON {text} or multipart files.",
        debug: { contentType },
      },
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


