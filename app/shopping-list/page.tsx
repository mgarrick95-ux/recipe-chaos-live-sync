// app/shopping-list/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import RcPageShell from "@/components/rc/RcPageShell";
import {
  categorizeItemName,
  type ShoppingCategory,
} from "@/lib/shoppingListCategories";

type Item = {
  id: string;
  user_id: string | null;
  name: string;
  normalized_name: string;
  source_type: string;
  source_recipe_id: string | null;
  source_recipe_title?: string | null;
  source_recipe_name?: string | null;
  checked: boolean;
  dismissed: boolean;
  quantity?: number | string | null;
};

type StorageItem = {
  id: string;
  name: string | null;
  location?: string | null;
  quantity?: number | null;
  unit?: string | null;
  use_by?: string | null;
  stored_on?: string | null;
  notes?: string | null;
};

type Group = {
  key: string;
  display: string;
  category: ShoppingCategory;
  items: Item[];
};

const CATEGORY_ORDER: ShoppingCategory[] = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Bakery",
  "Frozen",
  "Pantry",
  "Spices & Baking",
  "Snacks",
  "Beverages",
  "Household",
  "Other",
];

// Pantry/Freezer -> Shopping review tracking (localStorage)
const PF_EVENTS_KEY = "rc_pf_shopping_events";
const SHOP_LAST_VISIT_KEY = "rc_shopping_last_visit_ts";
const SHOP_PF_ACK_TS_KEY = "rc_shopping_pf_ack_ts";

// Shopping duplicates ignore key
const SHOP_DUP_IGNORE_KEY = "rc_shopping_dup_ignore_v1";

// Already-have reminders preference + snapshot
const SHOP_DUP_REMIND_MODE_KEY = "rc_shopping_dup_remind_mode_v3"; // "on" | "off"
const SHOP_DUP_OFF_SNAPSHOT_KEY = "rc_shopping_dup_off_snapshot_v3"; // string[]

// Burn confirmation preference
const SHOP_BURN_SKIP_CONFIRM_KEY = "rc_shop_burn_skip_confirm_v1";

type PfEvent = { name: string; ts: number };

function loadPfEvents(): PfEvent[] {
  try {
    const raw = localStorage.getItem(PF_EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? (parsed as PfEvent[]).filter(
          (e) => typeof e?.ts === "number" && typeof e?.name === "string"
        )
      : [];
  } catch {
    return [];
  }
}

function loadAckTs(): number {
  try {
    const rawAck = localStorage.getItem(SHOP_PF_ACK_TS_KEY);
    const ack = rawAck ? Number(rawAck) : 0;
    if (Number.isFinite(ack) && ack > 0) return ack;

    const rawLegacy = localStorage.getItem(SHOP_LAST_VISIT_KEY);
    const legacy = rawLegacy ? Number(rawLegacy) : 0;
    return Number.isFinite(legacy) ? legacy : 0;
  } catch {
    return 0;
  }
}

function saveAckTs(ts: number) {
  try {
    localStorage.setItem(SHOP_PF_ACK_TS_KEY, String(ts));
    localStorage.setItem(SHOP_LAST_VISIT_KEY, String(ts));
  } catch {
    // ignore
  }
}

function prunePfEvents(keepAfterTs: number) {
  try {
    const events = loadPfEvents();
    const kept = events.filter((e) => e.ts > keepAfterTs).slice(0, 200);
    localStorage.setItem(PF_EVENTS_KEY, JSON.stringify(kept));
  } catch {
    // ignore
  }
}

/* =========================
   Display / title cleanup
========================= */

function normalizeFractionChars(raw: string): string {
  return (raw || "")
    .replace(/[\u2044\u2215\uFF0F]/g, "/")
    .replace(/\u00BC/g, " 1/4 ")
    .replace(/\u00BD/g, " 1/2 ")
    .replace(/\u00BE/g, " 3/4 ")
    .replace(/\u2153/g, " 1/3 ")
    .replace(/\u2154/g, " 2/3 ")
    .replace(/\u215B/g, " 1/8 ")
    .replace(/\u215C/g, " 3/8 ")
    .replace(/\u215D/g, " 5/8 ")
    .replace(/\u215E/g, " 7/8 ");
}

function stripTrailingNotes(display: string): string {
  let s = (display || "").trim();
  if (!s) return s;

  const parts = s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return s;

  const first = parts[0];
  const rest = parts.slice(1).join(", ").toLowerCase();

  const removable = [
    "divided",
    "melted",
    "softened",
    "room temperature",
    "at room temperature",
    "to taste",
    "or to taste",
    "more to taste",
    "or more to taste",
    "as needed",
    "for serving",
    "for garnish",
    "optional",
    "chopped",
    "finely chopped",
    "roughly chopped",
    "diced",
    "minced",
    "sliced",
    "grated",
    "peeled",
    "seeded",
    "crushed",
    "drained",
    "rinsed",
    "freshly",
    "warm",
    "cold",
  ];

  const shouldStrip =
    removable.some((p) => rest.includes(p)) || rest.split(" ").length <= 4;

  return shouldStrip ? first : s;
}

function stripLeadingPrepWords(s: string): string {
  let out = (s || "").trim();
  if (!out) return out;

  out = out.replace(/^freshly\s+/i, "");

  const drop = [
    "fresh",
    "bulb",
    "bulbs",
    "bunch",
    "bunches",
    "chopped",
    "finely chopped",
    "roughly chopped",
    "coarsely chopped",
    "diced",
    "finely diced",
    "minced",
    "sliced",
    "thinly sliced",
    "peeled",
    "seeded",
    "drained",
    "rinsed",
    "optional",
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const phrase of drop.sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`^${phrase}\\s+`, "i");
      if (re.test(out)) {
        out = out.replace(re, "").trim();
        changed = true;
        break;
      }
    }
  }

  return out;
}

const KEEP_PAREN_HINTS = [
  "shredded",
  "ground",
  "unsalted",
  "salted",
  "low sodium",
  "reduced sodium",
  "gluten free",
  "gluten-free",
  "gf",
  "skim",
  "fat free",
  "nonfat",
  "2%",
  "1%",
  "whole",
];

const DROP_PAREN_HINTS = [
  "to taste",
  "or to taste",
  "at room temperature",
  "room temperature",
  "divided",
  "for garnish",
  "for serving",
  "optional",
  "as needed",
  "more to taste",
  "i like",
  "i prefer",
  "my favorite",
  "brand",
];

function cleanParentheticals(s: string): string {
  let out = (s || "").trim();
  if (!out) return out;

  out = out.replace(/\(([^)]+)\)/g, (_whole, insideRaw: string) => {
    const inside = String(insideRaw || "").trim();
    if (!inside) return "";

    const low = inside.toLowerCase();

    if (DROP_PAREN_HINTS.some((h) => low.includes(h))) return "";
    if (KEEP_PAREN_HINTS.some((h) => low.includes(h))) {
      const normalized = inside
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^[-–—]\s*/, "");
      return ` (${normalized})`;
    }
    return "";
  });

  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
}

function toTitleCaseSmart(input: string): string {
  const s = (input || "").trim();
  if (!s) return s;

  const letters = s.replace(/[^A-Za-z]/g, "");
  const upperLetters = letters.replace(/[^A-Z]/g, "").length;
  const isMostlyUpper =
    letters.length >= 4 && upperLetters / letters.length > 0.7;

  if (!isMostlyUpper) return s;

  const lower = s.toLowerCase();
  const keepLower = new Set(["and", "or", "of", "the", "to", "in", "with"]);

  return lower
    .split(" ")
    .map((w, idx) => {
      if (!w) return w;
      if (idx !== 0 && keepLower.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ")
    .replace(/\b(i|ii|iii|iv|v)\b/gi, (m) => m.toUpperCase());
}

/* =========================
   Duplicate matching helpers
========================= */

const CONTAINER_WORDS = new Set([
  "bottle",
  "bottles",
  "can",
  "cans",
  "pack",
  "packs",
  "package",
  "packages",
  "pkg",
  "box",
  "boxes",
  "bag",
  "bags",
  "jar",
  "jars",
  "carton",
  "cartons",
  "case",
  "cases",
  "loaf",
  "loaves",
  "bundle",
  "bundles",
  "tray",
  "trays",
  "tub",
  "tubs",
  "cup",
  "cups",
  "pcs",
  "pc",
  "piece",
  "pieces",
  "bunch",
  "bunches",
]);

// Words that indicate a fundamentally different product (don’t match)
const DIFFERENT_PRODUCT_MARKERS = new Set([
  "powder",
  "powdered",
  "granules",
  "granulated",
  "flakes",
  "flaked",
  "seasoning",
  "seasoned",
  "salt",
  "salts",
  "extract",
  "concentrate",
]);

// Milk logic: plant vs dairy + dairy fat variants
const PLANT_MILK_MARKERS = new Set([
  "almond",
  "oat",
  "soy",
  "soya",
  "coconut",
  "cashew",
  "rice",
  "hemp",
  "pea",
  "macadamia",
]);

const DAIRY_MILK_VARIANTS = new Set([
  "whole",
  "skim",
  "nonfat",
  "fatfree",
  "fat-free",
  "lowfat",
  "low-fat",
  "reducedfat",
  "reduced-fat",
  "2%",
  "1%",
  "2",
  "1",
]);

function normalizeName(input: string) {
  return (input || "")
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensAll(rawDisplay: string): string[] {
  const norm = normalizeName(rawDisplay);
  return norm
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 1);
}

function tokensForName(rawDisplay: string): string[] {
  const norm = normalizeName(rawDisplay);
  const tokens = norm
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !CONTAINER_WORDS.has(t));

  return tokens.filter((t) => t.length >= 2);
}

function canonicalKey(rawDisplay: string): string {
  return tokensForName(rawDisplay).join(" ").trim();
}

function isMeaningfulTokenSet(tokens: string[]) {
  if (tokens.length >= 2) return true;
  if (tokens.length === 1) return tokens[0].length >= 4;
  return false;
}

function tokenSubsetMatch(a: string[], b: string[]): boolean {
  if (!isMeaningfulTokenSet(a) || !isMeaningfulTokenSet(b)) return false;

  const aSet = new Set(a);
  const bSet = new Set(b);
  const [small, large] = aSet.size <= bSet.size ? [aSet, bSet] : [bSet, aSet];

  let matched = 0;
  for (const t of small) if (large.has(t)) matched++;
  return matched === small.size;
}

type MilkKind =
  | { kind: "none" }
  | { kind: "dairy"; variants: string[] }
  | { kind: "plant"; plantType: string };

function detectMilkKind(rawName: string): MilkKind {
  const toks = tokensAll(displayBaseName(rawName));
  const hasMilk = toks.includes("milk");
  if (!hasMilk) return { kind: "none" };

  const plant = toks.find((t) => PLANT_MILK_MARKERS.has(t));
  if (plant) return { kind: "plant", plantType: plant };

  // dairy
  const variants = toks
    .map((t) => t.toLowerCase())
    .filter((t) => DAIRY_MILK_VARIANTS.has(t))
    .map((t) => {
      if (t === "fat free") return "fat-free";
      return t;
    });

  // normalize numeric-only "1" / "2" only when '%' absent is noisy; keep if it was actually in tokens
  const uniq = Array.from(new Set(variants));
  uniq.sort();
  return { kind: "dairy", variants: uniq };
}

function isDifferentProductByMarkers(aRaw: string, bRaw: string): boolean {
  const a = new Set(tokensAll(displayBaseName(aRaw)));
  const b = new Set(tokensAll(displayBaseName(bRaw)));

  // If one has a different-product marker and the other does not, treat as different.
  for (const m of DIFFERENT_PRODUCT_MARKERS) {
    const aHas = a.has(m);
    const bHas = b.has(m);
    if (aHas !== bHas) return true;
  }

  // Special case explicitly requested: garlic vs garlic powder
  const aGarlic = a.has("garlic");
  const bGarlic = b.has("garlic");
  if (aGarlic && bGarlic) {
    const aPowder = a.has("powder") || a.has("powdered");
    const bPowder = b.has("powder") || b.has("powdered");
    if (aPowder !== bPowder) return true;
  }

  return false;
}

/* =========================
   Size/container meta parsing
========================= */

function looksLikeSizeText(s: string): boolean {
  const t = (s || "").toLowerCase();
  return (
    /\d/.test(t) &&
    /(oz|ounce|ounces|ml|l|liter|litre|liters|litres|g|gram|grams|kg|lb|pound|pounds|quart|qt|pint|pt|fl|fluid|count|ct)\b/.test(
      t
    )
  );
}

function normalizeUnitMeta(meta: string): string {
  let s = (meta || "").trim();
  if (!s) return s;

  s = s.replace(/\bfluid ounces?\b/gi, "fl oz");
  s = s.replace(/\bounces?\b/gi, "oz");
  s = s.replace(/\bmilliliters?\b/gi, "mL");
  s = s.replace(/\bmillilitre?s?\b/gi, "mL");
  s = s.replace(/\bliters?\b/gi, "L");
  s = s.replace(/\blitres?\b/gi, "L");
  s = s.replace(/\bgrams?\b/gi, "g");
  s = s.replace(/\bkilograms?\b/gi, "kg");
  s = s.replace(/\bpounds?\b/gi, "lb");

  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function parseDisplayParts(raw: string): { name: string; meta: string } {
  let s = normalizeFractionChars(raw || "").trim();
  if (!s) return { name: "", meta: "" };

  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/^[-•*]+\s*/, "").trim();

  const metaParts: string[] = [];

  const paren = s.match(/^\(([^)]+)\)\s*(.*)$/);
  if (paren) {
    const inside = (paren[1] || "").trim();
    const rest = (paren[2] || "").trim();
    if (inside && looksLikeSizeText(inside)) {
      metaParts.push(normalizeUnitMeta(inside));
      s = rest;
    }
  }

  s = s
    .replace(
      /^(fluid ounces?|fl oz|ounces?|ounce|oz|grams?|gram|g|kilograms?|kilogram|kg|liters?|litres?|liter|litre|l|milliliters?|millilitres?|ml)\s+/i,
      ""
    )
    .trim();

  const t1 = s.split(" ").filter(Boolean);
  if (t1.length >= 2) {
    const first = t1[0].toLowerCase();
    if (CONTAINER_WORDS.has(first)) {
      metaParts.push(first);
      s = t1.slice(1).join(" ").trim();
    }
  }

  const leadMeasure = s.match(
    /^(\d+(?:\.\d+)?|\d+\s+\d+\/\d+|\d+\/\d+)\s*(fl\s*oz|oz|lb|lbs|g|kg|ml|l|liter|litre|pound|pounds|gram|grams|ounce|ounces)\b\.?\s*(.*)$/i
  );
  if (leadMeasure) {
    const qty = (leadMeasure[1] || "").trim();
    const unit = (leadMeasure[2] || "").trim();
    const rest = (leadMeasure[3] || "").trim();
    metaParts.push(normalizeUnitMeta(`${qty} ${unit}`));
    s = rest;
  }

  const t2 = s.split(" ").filter(Boolean);
  if (t2.length >= 2) {
    const first2 = t2[0].toLowerCase();
    if (CONTAINER_WORDS.has(first2)) {
      metaParts.push(first2);
      s = t2.slice(1).join(" ").trim();
    }
  }

  s = s.replace(/^of\s+/i, "").trim();

  s = cleanParentheticals(s);
  s = stripLeadingPrepWords(s);
  s = stripTrailingNotes(s);

  s = s.replace(/\s{2,}/g, " ").trim();
  s = s.replace(/\s+\./g, ".").trim();

  const meta = metaParts
    .map((m) => m.trim())
    .filter(Boolean)
    .join(" • ");

  return { name: s.trim(), meta };
}

function displayBaseName(raw: string) {
  const parts = parseDisplayParts(raw);
  const name = parts.name.trim() || (raw || "").trim();
  return name;
}

function displayMeta(raw: string) {
  const parts = parseDisplayParts(raw);
  return parts.meta.trim();
}

function recipeLabelForItem(it: Item): string {
  return (
    (it.source_recipe_title ?? it.source_recipe_name ?? null) ||
    (it.source_recipe_id ? "Recipe" : "") ||
    ""
  );
}

function coerceQty(value: unknown, fallback = 1): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.floor(value);
    return n >= 1 ? n : fallback;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return fallback;
    const n = Math.floor(parsed);
    return n >= 1 ? n : fallback;
  }
  return fallback;
}

function itemQty(it: Item): number {
  return coerceQty((it as any)?.quantity, 1);
}

/* =========================
   Duplicates ignore + reminders storage
========================= */

function loadDupIgnore(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SHOP_DUP_IGNORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

function saveDupIgnore(map: Record<string, number>) {
  try {
    localStorage.setItem(SHOP_DUP_IGNORE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

type DupRemindMode = "on" | "off";

function loadDupRemindMode(): DupRemindMode {
  try {
    const raw = localStorage.getItem(SHOP_DUP_REMIND_MODE_KEY);
    return raw === "on" ? "on" : "off";
  } catch {
    return "off";
  }
}

function saveDupRemindMode(next: DupRemindMode) {
  try {
    localStorage.setItem(SHOP_DUP_REMIND_MODE_KEY, next);
  } catch {
    // ignore
  }
}

function loadDupOffSnapshot(): string[] {
  try {
    const raw = localStorage.getItem(SHOP_DUP_OFF_SNAPSHOT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function saveDupOffSnapshot(list: string[]) {
  try {
    localStorage.setItem(SHOP_DUP_OFF_SNAPSHOT_KEY, JSON.stringify(list || []));
  } catch {
    // ignore
  }
}

function loadBurnSkipConfirm(): boolean {
  try {
    const raw = localStorage.getItem(SHOP_BURN_SKIP_CONFIRM_KEY);
    return raw === "1" || raw === "true";
  } catch {
    return false;
  }
}

function saveBurnSkipConfirm(next: boolean) {
  try {
    localStorage.setItem(SHOP_BURN_SKIP_CONFIRM_KEY, next ? "1" : "0");
  } catch {
    // ignore
  }
}

/* =========================
   Small UI helpers
========================= */

const btn =
  "rounded-2xl bg-white/10 hover:bg-white/15 px-4 py-2.5 text-sm font-semibold ring-1 ring-white/10 transition";
const btnPrimary =
  "rounded-2xl bg-fuchsia-500 hover:bg-fuchsia-400 px-4 py-2.5 text-sm font-semibold disabled:opacity-50 shadow-lg shadow-fuchsia-500/20 transition";

const btnSm =
  "rounded-xl bg-white/8 hover:bg-white/12 px-3 py-2 text-xs font-semibold ring-1 ring-white/10 transition";

const iconBtn =
  "rounded-xl bg-white/8 hover:bg-white/12 px-3 py-2 text-xs font-extrabold ring-1 ring-white/10 transition";

type AnchorRect = { left: number; top: number; width: number; height: number };

type AddDupAction = "inc_existing" | "add_new_row";

type AddDuplicatePrompt = {
  open: boolean;
  existingId: string;
  existingName: string;
  requestedName: string;
  actionIfYes: AddDupAction;
};

export default function ShoppingListPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [storageItems, setStorageItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("");

  const [newItemName, setNewItemName] = useState("");

  // Pantry/Freezer review + highlight state
  const [pfAckTs, setPfAckTs] = useState(0);
  const [pfEvents, setPfEvents] = useState<PfEvent[]>([]);
  const [pfReviewOpen, setPfReviewOpen] = useState(false);

  // Already-have reminders / decisions
  const [dupReviewOpen, setDupReviewOpen] = useState(false);
  const [dupIgnoreMap, setDupIgnoreMap] = useState<Record<string, number>>({});
  const [dupResolved, setDupResolved] = useState<Record<string, true>>({}); // session-only "handled"

  const [dupRemindMode, setDupRemindMode] = useState<DupRemindMode>("off");
  const [dupOffSnapshot, setDupOffSnapshot] = useState<string[]>([]);

  // Burn the evidence prompt + preference
  const [burnPromptOpen, setBurnPromptOpen] = useState(false);
  const [burnSkipConfirm, setBurnSkipConfirm] = useState(false);
  const [burnDontAskAgainChecked, setBurnDontAskAgainChecked] = useState(false);

  // ✅ Simple Yes/No duplicate prompt for manual add
  const [addDupPrompt, setAddDupPrompt] = useState<AddDuplicatePrompt | null>(
    null
  );

  // Details popover
  const [detailsOpenKey, setDetailsOpenKey] = useState<string | null>(null);
  const [detailsAnchor, setDetailsAnchor] = useState<AnchorRect | null>(null);

  // Quantity popover (single-item)
  const [qtyOpenId, setQtyOpenId] = useState<string | null>(null);
  const [qtyAnchor, setQtyAnchor] = useState<AnchorRect | null>(null);

  // Quantity popover (group-level)
  const [groupQtyOpenKey, setGroupQtyOpenKey] = useState<string | null>(null);
  const [groupQtyAnchor, setGroupQtyAnchor] = useState<AnchorRect | null>(null);

  // Action menu popover (…)
  const [menuOpenKey, setMenuOpenKey] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);

  const pageRootRef = useRef<HTMLDivElement | null>(null);

  function getAnchorRectFromEl(el: HTMLElement): AnchorRect {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  function closeAllPopovers() {
    setDetailsOpenKey(null);
    setDetailsAnchor(null);
    setQtyOpenId(null);
    setQtyAnchor(null);
    setGroupQtyOpenKey(null);
    setGroupQtyAnchor(null);
    setMenuOpenKey(null);
    setMenuAnchor(null);
  }

  useEffect(() => {
    try {
      setBurnSkipConfirm(loadBurnSkipConfirm());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      setDupRemindMode(loadDupRemindMode());
      setDupOffSnapshot(loadDupOffSnapshot());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeAllPopovers();
        setBurnPromptOpen(false);
        setDupReviewOpen(false);
        setPfReviewOpen(false);
        setAddDupPrompt(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onScrollOrResize() {
      closeAllPopovers();
    }
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, []);

  function normalizeIncomingItem(raw: any): Item {
    return {
      ...(raw || {}),
      quantity: coerceQty(raw?.quantity, 1),
    } as Item;
  }

  async function loadShopping() {
    const res = await fetch("/api/shopping-list/items", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || "Failed to load shopping list");
    const list = Array.isArray(json?.items) ? (json.items as any[]) : [];
    return list.map(normalizeIncomingItem);
  }

  async function loadStorage() {
    const res = await fetch("/api/storage-items", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error || "Failed to load storage items");
    return Array.isArray(json?.items) ? (json.items as StorageItem[]) : [];
  }

  async function load() {
    setLoading(true);
    try {
      const [shopping, storage] = await Promise.all([
        loadShopping(),
        loadStorage(),
      ]);
      setItems(shopping);
      setStorageItems(storage);
    } catch (e: any) {
      alert(e?.message || "Load error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    try {
      setPfAckTs(loadAckTs());
      setPfEvents(loadPfEvents());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      setDupIgnoreMap(loadDupIgnore());
    } catch {
      // ignore
    }
  }, []);

  // ✅ Canonical group key: fixes “milk carton” vs “milk” everywhere.
  function groupKeyForDisplayName(rawName: string): string {
    const base = displayBaseName(rawName || "");
    const toks = tokensForName(base);
    const canon = canonicalKey(base);
    if (canon && isMeaningfulTokenSet(toks)) return canon;
    return base.toLowerCase();
  }

  function pickGroupDisplayName(list: Item[]): string {
    // Prefer manual label if present; otherwise pick shortest base name.
    const manual = list.find((x) => (x.source_type || "").trim() !== "derived");
    if (manual?.name) return displayBaseName(manual.name);

    let best = displayBaseName(list[0]?.name || "");
    for (const it of list) {
      const d = displayBaseName(it.name || "");
      if (d && d.length < best.length) best = d;
    }
    return best;
  }

  // Pantry/Freezer highlight keys should match group keys
  const pfNewEvents = useMemo(() => {
    const base = (pfEvents || [])
      .filter((e) => e.ts > (pfAckTs || 0))
      .slice()
      .sort((a, b) => b.ts - a.ts);

    const seen = new Set<string>();
    const uniq: PfEvent[] = [];
    for (const e of base) {
      const key = groupKeyForDisplayName(e.name);
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(e);
    }
    return uniq;
  }, [pfEvents, pfAckTs]);

  const pfNewCount = pfNewEvents.length;

  const pfHighlightGroupKeys = useMemo(() => {
    const s = new Set<string>();
    for (const e of pfNewEvents) {
      const key = groupKeyForDisplayName(e.name);
      if (key) s.add(key);
    }
    return s;
  }, [pfNewEvents]);

  function acknowledgePfAdds() {
    const now = Date.now();
    saveAckTs(now);
    prunePfEvents(now);
    setPfAckTs(now);
    setPfEvents(loadPfEvents());
    setPfReviewOpen(false);
  }

  async function patchItem(
    id: string,
    patch: Partial<Pick<Item, "checked" | "dismissed" | "quantity">>
  ) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? ({ ...it, ...patch } as Item) : it))
    );

    const res = await fetch(`/api/shopping-list/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      await load();
      alert(json?.error || "Update failed");
      return;
    }

    if (json?.item) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? normalizeIncomingItem(json.item) : it
        )
      );
    }
  }

  async function patchMany(
    ids: string[],
    patch: Partial<Pick<Item, "checked" | "dismissed" | "quantity">>
  ) {
    if (ids.length === 0) return;

    setItems((prev) =>
      prev.map((it) =>
        ids.includes(it.id) ? ({ ...it, ...patch } as Item) : it
      )
    );

    const results = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`/api/shopping-list/items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const json = await res.json().catch(() => null);
        return { id, ok: res.ok, item: json?.item, error: json?.error };
      })
    );

    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      await load();
      alert(
        `Some items failed to update (${failures.length}).\n` +
          (failures[0].error || "Unknown error")
      );
      return;
    }

    setItems((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      for (const r of results) {
        if (r.item?.id) map.set(r.item.id, normalizeIncomingItem(r.item));
      }
      return Array.from(map.values());
    });
  }

  async function deleteMany(ids: string[]) {
    if (ids.length === 0) return;

    setItems((prev) => prev.filter((x) => !ids.includes(x.id)));

    const results = await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`/api/shopping-list/items/${id}`, {
          method: "DELETE",
        });
        const json = await res.json().catch(() => null);
        return { id, ok: res.ok, error: json?.error };
      })
    );

    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      await load();
      alert(
        `Some items failed to delete (${failures.length}).\n` +
          (failures[0].error || "Unknown error")
      );
    }
  }

  const activeItems = useMemo(() => items, [items]);
  const activeCount = activeItems.length;
  const activeCrossedCount = activeItems.filter((i) => i.checked).length;

  async function burnEvidenceNow() {
    const ids = activeItems.map((i) => i.id);
    if (ids.length === 0) return;

    closeAllPopovers();
    setStatus("Burning…");
    await deleteMany(ids);
    setStatus("");
    setBurnPromptOpen(false);
  }

  function maybePromptBurnIfAllCrossed(nextActive: Item[]) {
    if (nextActive.length === 0) return;
    const allCrossed = nextActive.every((i) => i.checked);
    if (allCrossed) setBurnPromptOpen(true);
  }

  async function toggleSelectAllActive() {
    if (activeCount === 0) return;
    closeAllPopovers();

    const allCrossed = activeItems.every((i) => i.checked);
    const next = !allCrossed;

    setStatus(next ? "Crossing off…" : "Undoing…");
    await patchMany(
      activeItems.map((i) => i.id),
      { checked: next }
    );
    setStatus("");

    const nextActive = activeItems.map((i) => ({ ...i, checked: next }));
    maybePromptBurnIfAllCrossed(nextActive);
  }

  const visibleItems = useMemo(() => items, [items]);

  // ✅ KEY FIX: group by canonical key (milk + milk carton collapse to one row)
  const groupedByCategory = useMemo(() => {
    const groupMap = new Map<string, Item[]>();

    for (const it of visibleItems) {
      const k = groupKeyForDisplayName(it.name);
      if (!k) continue;
      const arr = groupMap.get(k) || [];
      arr.push(it);
      groupMap.set(k, arr);
    }

    const groups: Group[] = [];
    for (const [groupKey, list] of groupMap.entries()) {
      const display = pickGroupDisplayName(list);
      const category = categorizeItemName(display);
      groups.push({ key: groupKey, display, category, items: list.slice() });
    }

    const catMap = new Map<ShoppingCategory, Group[]>();
    for (const c of CATEGORY_ORDER) catMap.set(c, []);

    for (const g of groups) catMap.get(g.category)!.push(g);

    for (const c of CATEGORY_ORDER) {
      catMap.set(
        c,
        (catMap.get(c) || [])
          .slice()
          .map((g) => {
            g.items = g.items
              .slice()
              .sort((a, b) => {
                if (a.checked !== b.checked) return a.checked ? 1 : -1;
                return a.name.localeCompare(b.name);
              });
            return g;
          })
          .sort((a, b) => {
            const aAllChecked = a.items.every((i) => i.checked);
            const bAllChecked = b.items.every((i) => i.checked);
            if (aAllChecked !== bAllChecked) return aAllChecked ? 1 : -1;
            return a.display.localeCompare(b.display);
          })
      );
    }

    return catMap;
  }, [visibleItems]);

  // Category-level status
  const categoryStatus = useMemo(() => {
    const map = new Map<
      ShoppingCategory,
      { ids: string[]; all: boolean; any: boolean }
    >();

    for (const c of CATEGORY_ORDER) {
      const groups = groupedByCategory.get(c) || [];
      const ids: string[] = [];
      let any = false;
      let all = true;

      for (const g of groups) {
        for (const it of g.items) {
          ids.push(it.id);
          any = any || !!it.checked;
          all = all && !!it.checked;
        }
      }

      if (ids.length === 0) all = false;
      map.set(c, { ids, all, any });
    }

    return map;
  }, [groupedByCategory]);

  async function toggleCategoryChecked(cat: ShoppingCategory, next: boolean) {
    const info = categoryStatus.get(cat);
    const ids = info?.ids || [];
    if (ids.length === 0) return;

    setStatus("Updating…");
    await patchMany(ids, { checked: next });
    setStatus("");

    const nextActive = items.map((it) =>
      ids.includes(it.id) ? { ...it, checked: next } : it
    );
    maybePromptBurnIfAllCrossed(nextActive);
  }

  // Storage signatures for “already have it”
  const storageSignatures = useMemo(() => {
    const sigs: {
      canonical: string;
      tokens: string[];
      items: StorageItem[];
    }[] = [];

    const map = new Map<string, { tokens: string[]; items: StorageItem[] }>();

    for (const s of storageItems || []) {
      const name = (s?.name || "").trim();
      if (!name) continue;

      const qty = typeof s.quantity === "number" ? s.quantity : null;
      if (qty === 0) continue;

      const base = displayBaseName(name);
      const canon = canonicalKey(base);
      const toks = tokensForName(base);
      if (!canon || !isMeaningfulTokenSet(toks)) continue;

      const ex = map.get(canon);
      if (!ex) map.set(canon, { tokens: toks, items: [s] });
      else ex.items.push(s);
    }

    for (const [canonical, v] of map.entries()) {
      sigs.push({ canonical, tokens: v.tokens, items: v.items });
    }

    sigs.sort((a, b) => a.canonical.localeCompare(b.canonical));
    return sigs;
  }, [storageItems]);

  const duplicateGroupsRaw = useMemo(() => {
    const ignored = dupIgnoreMap || {};

    const groupMap = new Map<string, Item[]>();
    for (const it of items) {
      const baseLower = displayBaseName(it.name).toLowerCase();
      if (!baseLower) continue;
      const arr = groupMap.get(baseLower) || [];
      arr.push(it);
      groupMap.set(baseLower, arr);
    }

    const dups: {
      key: string;
      display: string;
      canon: string;
      listItems: Item[];
      storageMatches: StorageItem[];
      isIgnored: boolean;
    }[] = [];

    for (const [_key, list] of groupMap.entries()) {
      const display = displayBaseName(list[0].name);
      const canon = canonicalKey(display);
      const toks = tokensForName(display);
      if (!canon || !isMeaningfulTokenSet(toks)) continue;

      let matches: StorageItem[] = [];
      const exact = storageSignatures.find((s) => s.canonical === canon);
      if (exact) matches = exact.items;
      else {
        const found = storageSignatures.find((s) =>
          tokenSubsetMatch(toks, s.tokens)
        );
        if (found) matches = found.items;
      }

      if (matches.length === 0) continue;

      dups.push({
        key: canon,
        display,
        canon,
        listItems: list,
        storageMatches: matches,
        isIgnored: !!ignored[canon],
      });
    }

    return dups.sort((a, b) => a.display.localeCompare(b.display));
  }, [items, storageSignatures, dupIgnoreMap]);

  const actionableAlreadyHave = useMemo(() => {
    const resolved = dupResolved || {};
    return duplicateGroupsRaw.filter((d) => !d.isIgnored && !resolved[d.canon]);
  }, [duplicateGroupsRaw, dupResolved]);

  const dupTotal = duplicateGroupsRaw.length;
  const dupIgnored = duplicateGroupsRaw.filter((d) => d.isIgnored).length;

  const showDecisionBanner = useMemo(() => {
    if (actionableAlreadyHave.length === 0) return false;
    if (dupRemindMode === "on") return true;

    const snapSet = new Set(dupOffSnapshot || []);
    return actionableAlreadyHave.some((d) => !snapSet.has(d.canon));
  }, [actionableAlreadyHave, dupRemindMode, dupOffSnapshot]);

  function setDupRemindersMode(next: DupRemindMode) {
    setDupRemindMode(next);
    saveDupRemindMode(next);

    if (next === "off") {
      const snapshot = actionableAlreadyHave.map((d) => d.canon).sort();
      setDupOffSnapshot(snapshot);
      saveDupOffSnapshot(snapshot);
    } else {
      setDupOffSnapshot([]);
      saveDupOffSnapshot([]);
    }
  }

  function dismissDecisionBanner() {
    const snapshot = actionableAlreadyHave.map((d) => d.canon).sort();
    setDupOffSnapshot(snapshot);
    saveDupOffSnapshot(snapshot);
  }

  function resetIgnoredDuplicates() {
    setDupIgnoreMap({});
    saveDupIgnore({});
  }

  function ignoreDuplicate(canon: string) {
    const next = { ...(dupIgnoreMap || {}) };
    next[canon] = Date.now();
    setDupIgnoreMap(next);
    saveDupIgnore(next);
  }

  function openDecisions() {
    closeAllPopovers();
    if (dupRemindMode === "off" && showDecisionBanner) {
      dismissDecisionBanner();
    }
    setDupReviewOpen(true);
  }

  function maybeAutoCloseDecisions(nextResolved: Record<string, true>) {
    const left = duplicateGroupsRaw.filter(
      (d) => !d.isIgnored && !nextResolved[d.canon]
    );
    if (left.length === 0) setDupReviewOpen(false);
  }

  async function removeFromList(canon: string, listItems: Item[]) {
    setDupResolved((prev) => {
      const next = { ...(prev || {}), [canon]: true };
      maybeAutoCloseDecisions(next);
      return next;
    });

    setStatus("Removing…");
    await deleteMany(listItems.map((i) => i.id));
    setStatus("");
  }

  function keepOnListForNow(canon: string) {
    setDupResolved((prev) => {
      const next = { ...(prev || {}), [canon]: true };
      maybeAutoCloseDecisions(next);
      return next;
    });

    if (dupRemindMode === "off") {
      const snapshot = actionableAlreadyHave
        .filter((d) => d.canon !== canon)
        .map((d) => d.canon)
        .sort();
      setDupOffSnapshot(snapshot);
      saveDupOffSnapshot(snapshot);
    }
  }

  function ignoreMatchForever(canon: string) {
    ignoreDuplicate(canon);
    setDupResolved((prev) => {
      const next = { ...(prev || {}), [canon]: true };
      maybeAutoCloseDecisions(next);
      return next;
    });

    if (dupRemindMode === "off") {
      const snapshot = actionableAlreadyHave
        .filter((d) => d.canon !== canon)
        .map((d) => d.canon)
        .sort();
      setDupOffSnapshot(snapshot);
      saveDupOffSnapshot(snapshot);
    }
  }

  const showPfPanel = pfNewCount > 0;

  function popoverStyle(
    anchor: AnchorRect | null,
    maxW = 360,
    approxH = 150
  ): React.CSSProperties | undefined {
    if (!anchor) return undefined;

    const margin = 10;

    let left = anchor.left;
    let top = anchor.top + anchor.height + 10;

    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;

    if (left + maxW + margin > vw)
      left = Math.max(margin, vw - maxW - margin);
    if (top + approxH + margin > vh)
      top = Math.max(margin, anchor.top - 10 - approxH);

    return {
      position: "fixed",
      left,
      top,
      width: maxW,
      zIndex: 60,
    };
  }

  function openDetailsPopover(
    groupKey: string,
    ev: React.MouseEvent<HTMLButtonElement>
  ) {
    ev.preventDefault();
    ev.stopPropagation();
    setMenuOpenKey(null);
    setMenuAnchor(null);
    setQtyOpenId(null);
    setQtyAnchor(null);
    setGroupQtyOpenKey(null);
    setGroupQtyAnchor(null);
    setDetailsOpenKey(groupKey);
    setDetailsAnchor(getAnchorRectFromEl(ev.currentTarget));
  }

  function openQtyPopover(
    itemId: string,
    ev: React.MouseEvent<HTMLButtonElement>
  ) {
    ev.preventDefault();
    ev.stopPropagation();
    setMenuOpenKey(null);
    setMenuAnchor(null);
    setDetailsOpenKey(null);
    setDetailsAnchor(null);
    setGroupQtyOpenKey(null);
    setGroupQtyAnchor(null);
    setQtyOpenId(itemId);
    setQtyAnchor(getAnchorRectFromEl(ev.currentTarget));
  }

  function openGroupQtyPopover(
    groupKey: string,
    ev: React.MouseEvent<HTMLButtonElement>
  ) {
    ev.preventDefault();
    ev.stopPropagation();
    setMenuOpenKey(null);
    setMenuAnchor(null);
    setDetailsOpenKey(null);
    setDetailsAnchor(null);
    setQtyOpenId(null);
    setQtyAnchor(null);
    setGroupQtyOpenKey(groupKey);
    setGroupQtyAnchor(getAnchorRectFromEl(ev.currentTarget));
  }

  function openMenuPopover(
    groupKey: string,
    ev: React.MouseEvent<HTMLButtonElement>
  ) {
    ev.preventDefault();
    ev.stopPropagation();
    setDetailsOpenKey(null);
    setDetailsAnchor(null);
    setQtyOpenId(null);
    setQtyAnchor(null);
    setGroupQtyOpenKey(null);
    setGroupQtyAnchor(null);
    setMenuOpenKey(groupKey);
    setMenuAnchor(getAnchorRectFromEl(ev.currentTarget));
  }

  async function adjustQty(item: Item, delta: number) {
    const current = itemQty(item);
    const next = Math.max(1, current + delta);
    if (next === current) return;

    setStatus("Updating…");
    await patchItem(item.id, { quantity: next });
    setStatus("");
  }

  function uniqStrings(list: string[]) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of list) {
      const k = String(s || "").trim();
      if (!k) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
    return out;
  }

  async function mergeGroupIntoQuantity(g: Group) {
    if (!g.items || g.items.length <= 1) return;

    const total = g.items.reduce((sum, it) => sum + itemQty(it), 0);
    const keeper = g.items[0];
    const extras = g.items.slice(1);

    if (
      !confirm(
        `Merge ${g.items.length} entries into one quantity (×${total})?\n\nThis will delete the extra entries.`
      )
    ) {
      return;
    }

    closeAllPopovers();
    setStatus("Merging…");
    await patchItem(keeper.id, { quantity: total });
    await deleteMany(extras.map((x) => x.id));
    setStatus("");
  }

  async function toggleGroupChecked(g: Group, next: boolean) {
    const ids = g.items.map((i) => i.id);
    if (ids.length === 0) return;

    setStatus("Updating…");
    await patchMany(ids, { checked: next });
    setStatus("");

    const nextActive = items.map((it) =>
      ids.includes(it.id) ? { ...it, checked: next } : it
    );
    maybePromptBurnIfAllCrossed(nextActive);
  }

  type ManualMatch =
    | { kind: "none" }
    | { kind: "same"; existing: Item }
    | { kind: "variant"; existing: Item };

  // ✅ Match rules:
  // - "same": exact canonical or safe subset (e.g., "milk" vs "milk carton") AND not a different-product case
  // - "variant": same base family but should be its own row if user says Yes (e.g., "milk" vs "whole milk")
  // - "none": no prompt
  function findExistingMatchForManualAdd(name: string): ManualMatch {
    const inputBase = displayBaseName(name);
    const inputCanon = canonicalKey(inputBase);
    const inputToks = tokensForName(inputBase);
    if (!inputCanon || !isMeaningfulTokenSet(inputToks)) return { kind: "none" };

    // Different-product markers (garlic vs garlic powder, etc.)
    // We check per-candidate below; keeping this quick exit only if input itself is weird
    const inputMilk = detectMilkKind(inputBase);

    // 1) Try exact canonical match first (safe merge/increment)
    for (const it of items) {
      const b = displayBaseName(it.name);
      if (isDifferentProductByMarkers(inputBase, b)) continue;

      const milkB = detectMilkKind(b);
      // Milk family rules:
      if (inputMilk.kind !== "none" || milkB.kind !== "none") {
        if (inputMilk.kind === "none" || milkB.kind === "none") {
          // one is milk, the other isn't
          // allow matching by canonical only; otherwise no
        } else if (inputMilk.kind === "plant" && milkB.kind === "plant") {
          if (inputMilk.plantType !== milkB.plantType) continue; // almond vs oat: no
        } else if (inputMilk.kind === "plant" || milkB.kind === "plant") {
          continue; // plant vs dairy: no
        }
      }

      const c = canonicalKey(b);
      const t = tokensForName(b);
      if (!c || !isMeaningfulTokenSet(t)) continue;
      if (c === inputCanon) return { kind: "same", existing: it };
    }

    // 2) Fuzzy/subset match (container words etc.), BUT:
    // - never match across plant/dairy milk
    // - never match garlic vs garlic powder
    // - if dairy milk variants differ (whole/2%/skim), treat as "variant" (add new row on Yes)
    for (const it of items) {
      const b = displayBaseName(it.name);
      if (isDifferentProductByMarkers(inputBase, b)) continue;

      const t = tokensForName(b);
      if (!isMeaningfulTokenSet(t)) continue;

      const inputMilk2 = inputMilk;
      const milkB = detectMilkKind(b);

      // Milk gating:
      if (inputMilk2.kind !== "none" || milkB.kind !== "none") {
        // If one is milk and the other isn't, only allow if subset match is strong AND the other contains milk too
        if (inputMilk2.kind === "none" || milkB.kind === "none") {
          continue; // don't match milk to non-milk
        }

        // plant vs dairy
        if (inputMilk2.kind === "plant" && milkB.kind === "plant") {
          if (inputMilk2.plantType !== milkB.plantType) continue;
        } else if (inputMilk2.kind === "plant" || milkB.kind === "plant") {
          continue;
        }

        // dairy vs dairy: if fat variants differ => prompt but "Yes" should add as new row
        if (inputMilk2.kind === "dairy" && milkB.kind === "dairy") {
          const aV = inputMilk2.variants.join("|");
          const bV = milkB.variants.join("|");
          // If either has a variant marker and they differ, treat as variant
          const hasAnyVariant = inputMilk2.variants.length > 0 || milkB.variants.length > 0;
          const differ = aV !== bV;
          if (hasAnyVariant && differ) {
            // only treat as variant if base is still the same family (subset match on tokens)
            const ok = tokenSubsetMatch(inputToks, t) || tokenSubsetMatch(t, inputToks);
            if (ok) return { kind: "variant", existing: it };
            continue;
          }
        }
      }

      // General subset match (milk carton vs milk, minced garlic vs garlic, etc.)
      const ok = tokenSubsetMatch(inputToks, t) || tokenSubsetMatch(t, inputToks);
      if (ok) return { kind: "same", existing: it };
    }

    return { kind: "none" };
  }

  async function addManualProceed(name: string) {
    closeAllPopovers();
    setStatus("Adding…");

    try {
      const res = await fetch("/api/shopping-list/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, quantity: 1 }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Add failed");

      if (json?.item) {
        const added = normalizeIncomingItem(json.item);
        setItems((prev) => [added as Item, ...prev]);
        setNewItemName("");
        setStatus("");
        window.setTimeout(() => setStatus(""), 600);
        return;
      }

      if (json?.note) {
        setStatus(String(json.note));
      } else {
        setStatus("Done");
      }

      setNewItemName("");
      window.setTimeout(() => setStatus(""), 1200);
    } catch (e: any) {
      alert(e?.message || "Add error");
      setStatus("");
    }
  }

  async function addManual() {
    const name = newItemName.trim();
    if (!name) return;

    // ✅ client-side match first
    const match = findExistingMatchForManualAdd(name);
    if (match.kind === "same") {
      setAddDupPrompt({
        open: true,
        existingId: match.existing.id,
        existingName: match.existing.name,
        requestedName: name,
        actionIfYes: "inc_existing",
      });
      setNewItemName("");
      return;
    }

    if (match.kind === "variant") {
      // Prompt, but YES = add new row (keep separate), NO = do nothing
      setAddDupPrompt({
        open: true,
        existingId: match.existing.id,
        existingName: match.existing.name,
        requestedName: name,
        actionIfYes: "add_new_row",
      });
      setNewItemName("");
      return;
    }

    await addManualProceed(name);
  }

  const totalVisibleCount = visibleItems.length;
  const totalVisibleQty = visibleItems.reduce((sum, it) => sum + itemQty(it), 0);
  const crossedOffVisibleCount = visibleItems.filter((i) => i.checked).length;

  const header = (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
          Shopping List{" "}
          <span className="inline-block align-middle ml-2 h-2.5 w-2.5 rounded-full bg-fuchsia-400 shadow-[0_0_24px_rgba(232,121,249,0.35)]" />
        </h1>

        <p className="mt-2 text-white/75 text-sm md:text-base">
          Items:{" "}
          <span className="text-white/85 font-semibold">{totalVisibleCount}</span>{" "}
          • Total qty:{" "}
          <span className="text-white/85 font-semibold">{totalVisibleQty}</span>{" "}
          • Crossed off:{" "}
          <span className="text-white/85 font-semibold">
            {crossedOffVisibleCount}
          </span>
          {status ? <span className="text-white/55"> • {status}</span> : null}
        </p>

        <div className="mt-1 text-xs md:text-sm text-white/55">
          Tap a row to cross it off. Burn the evidence clears the list.
        </div>

        {dupTotal > 0 ? (
          <div className="mt-2 text-xs text-white/55 flex items-center gap-2 flex-wrap">
            <span className="text-white/45">Already-have reminders:</span>
            <button
              type="button"
              className={btnSm}
              onClick={() =>
                setDupRemindersMode(dupRemindMode === "on" ? "off" : "on")
              }
              title={
                dupRemindMode === "on"
                  ? "On shows decisions as long as they exist."
                  : "Off stays quiet unless something new appears."
              }
            >
              {dupRemindMode === "on" ? "On" : "Off"}
            </button>

            <button
              type="button"
              className={btnSm}
              onClick={openDecisions}
              title="Open already-have decisions (quiet — no changes unless you choose)"
            >
              Decisions
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/meal-planning" className={btn}>
          ← Meal Planning
        </Link>

        <button
          type="button"
          onClick={toggleSelectAllActive}
          className={btn}
          disabled={activeCount === 0}
        >
          Select all
        </button>

        <button
          type="button"
          onClick={() => {
            if (activeCount === 0) return;

            if (burnSkipConfirm) {
              burnEvidenceNow();
              return;
            }

            setBurnDontAskAgainChecked(false);
            setBurnPromptOpen(true);
          }}
          className={btnPrimary}
          disabled={activeCount === 0}
          title="Clears the list"
        >
          Burn the evidence
        </button>
      </div>
    </div>
  );

  return (
    <RcPageShell header={header}>
      <div ref={pageRootRef} />

      {/* ✅ Simple Yes/No duplicate prompt */}
      {addDupPrompt?.open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAddDupPrompt(null);
          }}
        >
          <div className="w-full max-w-xl rounded-3xl bg-[#0b1026] ring-1 ring-white/10 p-6">
            <div className="text-xl font-extrabold tracking-tight">
              Already in list
            </div>

            <div className="mt-2 text-white/70">
              1{" "}
              <span className="text-white/85 font-semibold">
                {toTitleCaseSmart(displayBaseName(addDupPrompt.existingName))}
              </span>{" "}
              already in list… do you need this one too?
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 flex-wrap">
              <button
                type="button"
                className={btn}
                onClick={() => setAddDupPrompt(null)}
              >
                No
              </button>

              <button
                type="button"
                className={btnPrimary}
                onClick={async () => {
                  const prompt = addDupPrompt;
                  if (!prompt) return;

                  setAddDupPrompt(null);

                  if (prompt.actionIfYes === "inc_existing") {
                    const id = prompt.existingId;
                    const latest = items.find((x) => x.id === id);
                    if (!latest) {
                      await load();
                      return;
                    }

                    setStatus("Updating…");
                    await patchItem(id, { quantity: itemQty(latest) + 1 });
                    setStatus("");
                    return;
                  }

                  // actionIfYes === "add_new_row"
                  await addManualProceed(prompt.requestedName);
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Pantry/Freezer review panel */}
      {showPfPanel ? (
        <div className="mt-6 rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="text-white/90 font-semibold">
                {pfNewCount} item{pfNewCount === 1 ? "" : "s"} added from{" "}
                <span className="text-white/80">Pantry &amp; Freezer</span>.
              </div>
              <div className="mt-1 text-sm text-white/55">
                Highlighted until you acknowledge (does not change your list).
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                className={btn}
                onClick={() => setPfReviewOpen(true)}
                type="button"
              >
                Review
              </button>
              <button
                className={btnPrimary}
                onClick={acknowledgePfAdds}
                type="button"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Manual add */}
      <div className="mt-6 rounded-3xl bg-white/5 ring-1 ring-white/10 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Add item… (e.g., milk)"
            className="w-full md:flex-1 rounded-2xl bg-white/5 text-white placeholder:text-white/35 ring-1 ring-white/10 px-4 py-3 outline-none focus:ring-2 focus:ring-fuchsia-400/50"
            onKeyDown={(e) => {
              if (e.key === "Enter") addManual();
            }}
          />
          <button
            onClick={addManual}
            className={btnPrimary}
            type="button"
            disabled={!newItemName.trim()}
          >
            Add
          </button>
        </div>
        <div className="mt-2 text-xs text-white/55">
          Add is immediate. If it matches something, you’ll get one Yes/No choice.
        </div>
      </div>

      {loading ? (
        <div className="mt-6 text-white/70">Loading…</div>
      ) : (
        <div className="mt-6 grid gap-5">
          {CATEGORY_ORDER.map((cat) => {
            const groups = groupedByCategory.get(cat) || [];
            if (groups.length === 0) return null;

            const info = categoryStatus.get(cat);
            const catAll = !!info?.all;
            const catAny = !!info?.any;

            return (
              <div
                key={cat}
                className="rounded-3xl bg-white/5 ring-1 ring-white/10 p-4"
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={catAll}
                      ref={(el) => {
                        if (el) el.indeterminate = !catAll && catAny;
                      }}
                      onChange={(e) =>
                        toggleCategoryChecked(cat, e.target.checked)
                      }
                      className="h-5 w-5 accent-fuchsia-500"
                      aria-label={`Toggle category ${cat}`}
                      title="Toggle everything in this category"
                    />

                    <h2 className="m-0 text-base font-extrabold tracking-tight text-white/90">
                      {cat}
                    </h2>
                  </div>

                  <span className="text-xs font-extrabold text-white/55 rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    {groups.length}
                  </span>
                </div>

                <div className="mt-3 grid gap-2">
                  {groups.map((g) => {
                    const isHighlighted = pfHighlightGroupKeys.has(g.key);

                    const allCrossed = g.items.every((i) => i.checked);
                    const anyCrossed = g.items.some((i) => i.checked);

                    const groupQty = g.items.reduce(
                      (sum, it) => sum + itemQty(it),
                      0
                    );
                    const multi = g.items.length > 1;
                    const singleItem = g.items.length === 1 ? g.items[0] : null;

                    const meta = displayMeta(g.items[0]?.name || "");
                    const displayName = toTitleCaseSmart(g.display);

                    return (
                      <div
                        key={g.key}
                        className="rounded-2xl bg-white/5 ring-1 ring-white/10 px-3 py-3"
                        style={
                          isHighlighted
                            ? {
                                border: "1px solid rgba(232,121,249,0.25)",
                                background: "rgba(232,121,249,0.06)",
                                boxShadow: "0 0 18px rgba(232,121,249,0.08)",
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={allCrossed}
                              ref={(el) => {
                                if (el)
                                  el.indeterminate = !allCrossed && anyCrossed;
                              }}
                              onChange={(e) =>
                                toggleGroupChecked(g, e.target.checked)
                              }
                              className="mt-1 h-5 w-5 accent-fuchsia-500"
                              aria-label={`Toggle ${g.display}`}
                              title="Toggle this item (all entries)"
                            />

                            <div
                              className="min-w-0"
                              style={{
                                textDecoration: allCrossed
                                  ? "line-through"
                                  : "none",
                                opacity: allCrossed ? 0.6 : 1,
                              }}
                            >
                              <div className="text-sm md:text-base font-extrabold tracking-tight text-white/90 truncate">
                                {displayName}
                              </div>

                              {meta ? (
                                <div className="mt-1 text-xs text-white/50 truncate">
                                  {meta}
                                </div>
                              ) : null}

                              {multi ? (
                                <div className="mt-1 text-xs text-white/45">
                                  {g.items.length} entries
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-extrabold text-white/80 hover:bg-white/15"
                              title={
                                multi
                                  ? "Multiple entries (tap for options)"
                                  : "Adjust quantity"
                              }
                              onClick={(ev) => {
                                if (singleItem) openQtyPopover(singleItem.id, ev);
                                else openGroupQtyPopover(g.key, ev);
                              }}
                            >
                              ×{groupQty}
                            </button>

                            <button
                              type="button"
                              className={iconBtn}
                              title="Actions"
                              onClick={(ev) => openMenuPopover(g.key, ev)}
                            >
                              …
                            </button>
                          </div>
                        </div>

                        {groupQtyOpenKey === g.key && groupQtyAnchor ? (
                          <>
                            <div
                              className="fixed inset-0 z-50"
                              onMouseDown={() => {
                                setGroupQtyOpenKey(null);
                                setGroupQtyAnchor(null);
                              }}
                              style={{ background: "transparent" }}
                            />
                            <div
                              className="rounded-2xl bg-[#0b1026] ring-1 ring-white/10 p-3 shadow-2xl"
                              style={popoverStyle(groupQtyAnchor, 340, 140)}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <div className="text-sm font-extrabold text-white/85">
                                Multiple entries
                              </div>
                              <div className="mt-1 text-xs text-white/55">
                                Merge to edit quantity (doesn’t happen automatically).
                              </div>

                              <div className="mt-3 flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  className={btnSm}
                                  onClick={() => {
                                    setGroupQtyOpenKey(null);
                                    setGroupQtyAnchor(null);
                                  }}
                                >
                                  Close
                                </button>
                                <button
                                  type="button"
                                  className={btnSm}
                                  onClick={() => {
                                    setGroupQtyOpenKey(null);
                                    setGroupQtyAnchor(null);
                                    mergeGroupIntoQuantity(g);
                                  }}
                                >
                                  Merge now
                                </button>
                              </div>
                            </div>
                          </>
                        ) : null}

                        {qtyOpenId && qtyAnchor ? (
                          <>
                            <div
                              className="fixed inset-0 z-50"
                              onMouseDown={() => {
                                setQtyOpenId(null);
                                setQtyAnchor(null);
                              }}
                              style={{ background: "transparent" }}
                            />
                            <div
                              className="rounded-2xl bg-[#0b1026] ring-1 ring-white/10 p-3 shadow-2xl"
                              style={popoverStyle(qtyAnchor, 320, 110)}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              {(() => {
                                const it =
                                  items.find((x) => x.id === qtyOpenId) || null;
                                if (!it) {
                                  return (
                                    <div className="text-sm text-white/70">
                                      Missing item.
                                    </div>
                                  );
                                }
                                const q = itemQty(it);

                                return (
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm font-extrabold text-white/85">
                                      Qty: ×{q}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        className={btnSm}
                                        onClick={() => adjustQty(it, -1)}
                                      >
                                        −
                                      </button>
                                      <button
                                        type="button"
                                        className={btnSm}
                                        onClick={() => adjustQty(it, +1)}
                                      >
                                        +
                                      </button>
                                      <button
                                        type="button"
                                        className={btnSm}
                                        onClick={() => {
                                          setQtyOpenId(null);
                                          setQtyAnchor(null);
                                        }}
                                      >
                                        Close
                                      </button>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </>
                        ) : null}

                        {menuOpenKey === g.key && menuAnchor ? (
                          <>
                            <div
                              className="fixed inset-0 z-50"
                              onMouseDown={() => {
                                setMenuOpenKey(null);
                                setMenuAnchor(null);
                              }}
                              style={{ background: "transparent" }}
                            />
                            <div
                              className="rounded-2xl bg-[#0b1026] ring-1 ring-white/10 p-3 shadow-2xl"
                              style={popoverStyle(menuAnchor, 260, 170)}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-extrabold text-white/70">
                                  Actions
                                </div>
                                <button
                                  type="button"
                                  className={btnSm}
                                  onClick={() => {
                                    setMenuOpenKey(null);
                                    setMenuAnchor(null);
                                  }}
                                >
                                  Close
                                </button>
                              </div>

                              <div className="mt-3 grid gap-2">
                                <button
                                  type="button"
                                  className={btnSm}
                                  onClick={(ev) => {
                                    setMenuOpenKey(null);
                                    setMenuAnchor(null);
                                    openDetailsPopover(g.key, ev as any);
                                  }}
                                >
                                  Details
                                </button>

                                {g.items.length > 1 ? (
                                  <button
                                    type="button"
                                    className={btnSm}
                                    onClick={() => {
                                      setMenuOpenKey(null);
                                      setMenuAnchor(null);
                                      mergeGroupIntoQuantity(g);
                                    }}
                                  >
                                    Merge into one
                                  </button>
                                ) : null}

                                <button
                                  type="button"
                                  className={btnSm}
                                  onClick={() => {
                                    const ids = g.items.map((i) => i.id);
                                    setMenuOpenKey(null);
                                    setMenuAnchor(null);
                                    setStatus("Removing…");
                                    deleteMany(ids).finally(() => setStatus(""));
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </>
                        ) : null}

                        {detailsOpenKey === g.key && detailsAnchor ? (
                          <>
                            <div
                              className="fixed inset-0 z-50"
                              onMouseDown={() => closeAllPopovers()}
                              style={{ background: "transparent" }}
                            />

                            <div
                              className="rounded-2xl bg-[#0b1026] ring-1 ring-white/10 p-4 shadow-2xl"
                              style={popoverStyle(detailsAnchor, 340, 130)}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-extrabold tracking-tight text-white/90">
                                    {displayName}
                                  </div>
                                  <div className="mt-1 text-xs text-white/55">
                                    Source only.
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className={btnSm}
                                  onClick={closeAllPopovers}
                                >
                                  Close
                                </button>
                              </div>

                              <div className="mt-3 flex items-center gap-2 flex-wrap">
                                {(() => {
                                  const recipeLinks = uniqStrings(
                                    g.items
                                      .filter((it) => !!it.source_recipe_id)
                                      .map((it) => String(it.source_recipe_id))
                                  );

                                  const recipeTitles = uniqStrings(
                                    g.items
                                      .filter((it) => !!it.source_recipe_id)
                                      .map(
                                        (it) => recipeLabelForItem(it) || "Recipe"
                                      )
                                  );

                                  if (recipeLinks.length > 0) {
                                    return recipeLinks.map((rid, i) => (
                                      <Link
                                        key={rid}
                                        href={`/recipes/${rid}`}
                                        className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-extrabold text-white/80 hover:bg-white/15 underline underline-offset-2"
                                        onClick={(e) => e.stopPropagation()}
                                        title="Open recipe"
                                      >
                                        {recipeTitles[i] || "Recipe"}
                                      </Link>
                                    ));
                                  }

                                  const source =
                                    g.items[0]?.source_type?.trim() || "manual";
                                  return (
                                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-extrabold text-white/70">
                                      {source}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Burn prompt */}
      {burnPromptOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setBurnPromptOpen(false);
          }}
        >
          <div className="w-full max-w-xl rounded-3xl bg-[#0b1026] ring-1 ring-white/10 p-6">
            <div className="text-xl font-extrabold tracking-tight">
              {activeCount > 0 && activeCrossedCount === activeCount
                ? "All items crossed off."
                : "Burn the evidence?"}
            </div>

            <div className="mt-2 text-white/70">This deletes the list.</div>

            <label className="mt-5 flex items-center gap-3 text-sm text-white/75 select-none">
              <input
                type="checkbox"
                className="h-4 w-4 accent-fuchsia-500"
                checked={burnDontAskAgainChecked}
                onChange={(e) => setBurnDontAskAgainChecked(e.target.checked)}
              />
              Don’t ask again
            </label>

            <div className="mt-6 flex items-center justify-end gap-2 flex-wrap">
              <button
                type="button"
                className={btn}
                onClick={() => setBurnPromptOpen(false)}
              >
                Not yet
              </button>

              <button
                type="button"
                className={btnPrimary}
                onClick={async () => {
                  if (burnDontAskAgainChecked) {
                    setBurnSkipConfirm(true);
                    saveBurnSkipConfirm(true);
                  }
                  await burnEvidenceNow();
                }}
              >
                Burn the evidence
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Review Pantry Adds modal */}
      {pfReviewOpen && pfNewCount > 0 ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPfReviewOpen(false);
          }}
        >
          <div className="w-full max-w-xl rounded-3xl bg-[#0b1026] ring-1 ring-white/10 p-6">
            <div className="text-xl font-extrabold tracking-tight">
              Review Pantry Adds
            </div>
            <div className="mt-2 text-white/70">
              Recently added from Pantry &amp; Freezer:
            </div>

            <div className="mt-5 grid gap-6">
              <div
                className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4"
                style={{ maxHeight: 360, overflow: "auto" }}
              >
                <div className="grid gap-4">
                  {pfNewEvents.map((e) => (
                    <div
                      key={`${e.name}-${e.ts}`}
                      className="flex items-baseline justify-between gap-3 flex-wrap"
                    >
                      <div className="font-extrabold text-white/85">
                        {toTitleCaseSmart(displayBaseName(e.name))}
                      </div>
                      <div className="text-xs text-white/50">
                        {new Date(e.ts).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPfReviewOpen(false)}
                  className={btn}
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={acknowledgePfAdds}
                  className={btnPrimary}
                >
                  Acknowledge
                </button>
              </div>

              <div className="text-xs text-white/55">
                This doesn’t change your list — it just clears highlights.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Decision Tray modal (Already-have) */}
      {dupReviewOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDupReviewOpen(false);
          }}
        >
          <div className="w-full max-w-2xl rounded-3xl bg-[#0b1026] ring-1 ring-white/10 p-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xl font-extrabold tracking-tight">
                  Decisions
                </div>
                <div className="mt-2 text-white/70">
                  Already-have matches. Keep is the default. Nothing changes
                  unless you choose.
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {dupIgnored > 0 ? (
                  <button
                    type="button"
                    onClick={resetIgnoredDuplicates}
                    className={btn}
                  >
                    Reset ignored
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDupReviewOpen(false)}
                  className={btn}
                >
                  Close
                </button>
              </div>
            </div>

            <div
              className="mt-5 rounded-2xl bg-white/5 ring-1 ring-white/10 p-4"
              style={{ maxHeight: 460, overflow: "auto" }}
            >
              {actionableAlreadyHave.length === 0 ? (
                <div className="text-white/70 text-sm">
                  Nothing to decide right now.
                </div>
              ) : (
                <div className="grid gap-4">
                  {actionableAlreadyHave.map((d) => {
                    const storagePreview = d.storageMatches
                      .slice(0, 3)
                      .map((s) => {
                        const loc = (s.location || "Somewhere").toString();
                        const qty =
                          typeof s.quantity === "number" ? String(s.quantity) : "";
                        const unit = (s.unit || "").toString();
                        const qtyLabel = qty
                          ? `${qty}${unit ? ` ${unit}` : ""}`
                          : "";
                        return qtyLabel ? `${loc} • ${qtyLabel}` : `${loc}`;
                      })
                      .join(" · ");

                    return (
                      <div
                        key={d.canon}
                        className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4"
                      >
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="font-extrabold text-white/85 text-lg">
                              {toTitleCaseSmart(d.display)}
                            </div>
                            <div className="mt-1 text-sm text-white/55">
                              In storage:{" "}
                              <span className="text-white/75 font-semibold">
                                {storagePreview ||
                                  `${d.storageMatches.length} match(es)`}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              className={btnSm}
                              onClick={() => keepOnListForNow(d.canon)}
                              title="Resolve for now (no changes)"
                            >
                              Keep on list
                            </button>

                            <button
                              type="button"
                              className={btnSm}
                              onClick={() => removeFromList(d.canon, d.listItems)}
                              title="Delete from shopping list"
                            >
                              Remove from list
                            </button>

                            <button
                              type="button"
                              className={btnSm}
                              onClick={() => ignoreMatchForever(d.canon)}
                              title="Stop asking about this match"
                            >
                              Ignore match
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 text-xs text-white/45">
                          Default is keep. This is just a reminder tray.
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-4 text-xs text-white/55">
              Keep on list resolves for now. Ignore match stops future reminders
              for that match.
            </div>
          </div>
        </div>
      ) : null}
    </RcPageShell>
  );
}
