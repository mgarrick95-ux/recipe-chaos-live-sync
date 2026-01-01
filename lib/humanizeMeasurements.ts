// lib/humanizeMeasurements.ts
// Display-only helpers to make imported decimals look like real cooking measurements.
//
// Examples:
//  "0.333333333 cup butter" -> "⅓ cup butter"
//  "1.5 cups milk"          -> "1½ cups milk"
//  "2.25 tsp salt"          -> "2¼ tsp salt"
//  "1 1/2 cups"             -> "1½ cups"

const FRACTION_GLYPHS: Record<string, string> = {
  "1/8": "⅛",
  "1/6": "⅙",
  "1/5": "⅕",
  "1/4": "¼",
  "1/3": "⅓",
  "3/8": "⅜",
  "1/2": "½",
  "5/8": "⅝",
  "2/3": "⅔",
  "3/4": "¾",
  "4/5": "⅘",
  "5/6": "⅚",
  "7/8": "⅞",
};

const COMMON_FRACTIONS: Array<{ value: number; label: string }> = [
  { value: 0.125, label: "1/8" },
  { value: 1 / 6, label: "1/6" }, // ~0.1667
  { value: 0.2, label: "1/5" },
  { value: 0.25, label: "1/4" },
  { value: 1 / 3, label: "1/3" },
  { value: 0.375, label: "3/8" },
  { value: 0.5, label: "1/2" },
  { value: 0.625, label: "5/8" },
  { value: 2 / 3, label: "2/3" },
  { value: 0.75, label: "3/4" },
  { value: 0.8, label: "4/5" },
  { value: 5 / 6, label: "5/6" }, // ~0.8333
  { value: 0.875, label: "7/8" },
];

function nearlyEqual(a: number, b: number, tol: number) {
  return Math.abs(a - b) <= tol;
}

function formatNumberSmart(n: number): string {
  const roundedInt = Math.round(n);
  if (nearlyEqual(n, roundedInt, 1e-6)) return String(roundedInt);

  const s = n.toFixed(2);
  return s.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function fractionLabelToGlyph(label: string): string {
  return FRACTION_GLYPHS[label] || label;
}

function mixedToPretty(whole: number, fracLabel: string, sign: string): string {
  const glyph = fractionLabelToGlyph(fracLabel);
  if (whole === 0) return `${sign}${glyph}`;
  // Use no extra space for mixed numbers: "1½" looks best for cooking
  return `${sign}${whole}${glyph}`;
}

export function decimalToKitchenFraction(value: number): string {
  if (!Number.isFinite(value)) return "";

  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  const whole = Math.floor(abs);
  const frac = abs - whole;

  const tol = 0.02; // tolerance for float noise like 0.333333333

  let fracLabel: string | null = null;

  for (const f of COMMON_FRACTIONS) {
    if (nearlyEqual(frac, f.value, tol)) {
      fracLabel = f.label;
      break;
    }
  }

  if (fracLabel) {
    return mixedToPretty(whole, fracLabel, sign);
  }

  return `${sign}${formatNumberSmart(abs)}`;
}

function normalizeFractionString(num: string, den: string): string {
  const label = `${num}/${den}`;
  return fractionLabelToGlyph(label);
}

function replaceFirstQuantityToken(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return line;

  // Mixed fraction: "1 1/2"
  const mixedRe = /^(\d+)\s+(\d+)\s*\/\s*(\d+)\b/;
  const mixed = trimmed.match(mixedRe);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = mixed[2];
    const den = mixed[3];
    const glyph = normalizeFractionString(num, den);
    // "1½" style for cook friendliness
    return trimmed.replace(mixedRe, `${whole}${glyph}`);
  }

  // Fraction: "1/3"
  const fracRe = /^(\d+)\s*\/\s*(\d+)\b/;
  const frac = trimmed.match(fracRe);
  if (frac) {
    const num = frac[1];
    const den = frac[2];
    const glyph = normalizeFractionString(num, den);
    return trimmed.replace(fracRe, `${glyph}`);
  }

  // Decimal or integer at start: "0.333333333" or "1.5" or "2"
  const numRe = /^(-?\d+(?:\.\d+)?)(\b)/;
  const num = trimmed.match(numRe);
  if (!num) return line;

  const raw = num[1];
  const val = Number(raw);
  if (!Number.isFinite(val)) return line;

  const fracPart = Math.abs(val % 1);

  const shouldHumanize =
    raw.includes(".") &&
    (raw.length >= 5 ||
      nearlyEqual(fracPart, 0.5, 0.02) ||
      nearlyEqual(fracPart, 1 / 3, 0.02) ||
      nearlyEqual(fracPart, 2 / 3, 0.02) ||
      nearlyEqual(fracPart, 0.25, 0.02) ||
      nearlyEqual(fracPart, 0.75, 0.02) ||
      nearlyEqual(fracPart, 0.125, 0.02) ||
      nearlyEqual(fracPart, 0.375, 0.02) ||
      nearlyEqual(fracPart, 0.625, 0.02) ||
      nearlyEqual(fracPart, 0.875, 0.02));

  if (!shouldHumanize) {
    const nice = raw.includes(".") ? formatNumberSmart(val) : raw;
    return trimmed.replace(numRe, `${nice}$2`);
  }

  const pretty = decimalToKitchenFraction(val);
  return trimmed.replace(numRe, `${pretty}$2`);
}

export function humanizeIngredientLine(line: string): string {
  return replaceFirstQuantityToken(line);
}

export function humanizeIngredientLines(lines: string[]): string[] {
  return (lines || []).map((l) => humanizeIngredientLine(String(l)));
}
