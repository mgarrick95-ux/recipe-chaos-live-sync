// lib/ingredientCleanup.ts

// Turns ugly ingredient lines into nicer, more consistent ones.
// - trims bullets
// - normalizes whitespace
// - converts decimals like 0.3333333 cup -> 1/3 cup
// - converts 1.5 -> 1 1/2 (when it looks like a measurement)

const COMMON_UNITS = [
  "tsp",
  "teaspoon",
  "teaspoons",
  "tbsp",
  "tablespoon",
  "tablespoons",
  "cup",
  "cups",
  "oz",
  "ounce",
  "ounces",
  "lb",
  "pound",
  "pounds",
  "g",
  "gram",
  "grams",
  "kg",
  "ml",
  "l",
  "liter",
  "liters",
];

function gcd(a: number, b: number): number {
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return Math.abs(a);
}

function toFraction(x: number, maxDen = 16): { whole: number; num: number; den: number } | null {
  if (!isFinite(x)) return null;
  if (x <= 0) return null;

  const whole = Math.floor(x);
  const frac = x - whole;

  if (frac < 0.001) return { whole, num: 0, den: 1 };
  if (1 - frac < 0.001) return { whole: whole + 1, num: 0, den: 1 };

  // Find best rational approximation
  let bestNum = 0;
  let bestDen = 1;
  let bestErr = Infinity;

  for (let den = 2; den <= maxDen; den++) {
    const num = Math.round(frac * den);
    const err = Math.abs(frac - num / den);
    if (err < bestErr) {
      bestErr = err;
      bestNum = num;
      bestDen = den;
    }
  }

  if (bestErr > 0.03) return null; // don't force weird fractions

  const d = gcd(bestNum, bestDen);
  const num = bestNum / d;
  const den = bestDen / d;
  return { whole, num, den };
}

function fractionToString(whole: number, num: number, den: number): string {
  if (num === 0) return String(whole);
  if (whole === 0) return `${num}/${den}`;
  return `${whole} ${num}/${den}`;
}

function looksLikeMeasurementContext(line: string): boolean {
  const lower = line.toLowerCase();
  return COMMON_UNITS.some((u) => lower.includes(` ${u}`) || lower.startsWith(`${u} `) || lower.includes(`${u},`));
}

function stripBullets(s: string): string {
  return s.replace(/^\s*[-*•·]+\s*/, "").trim();
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Convert leading decimal number tokens to nicer fractions.
// Example: "0.3333333 cup butter" -> "1/3 cup butter"
// Example: "1.5 cups milk" -> "1 1/2 cups milk"
function convertLeadingDecimalToFraction(line: string): string {
  const m = line.match(/^\s*(\d+(\.\d+))\s+(.*)$/);
  if (!m) return line;

  const value = parseFloat(m[1]);
  const rest = m[3];

  // Only do this if it looks like it’s a measurement (unit present)
  const candidate = `${m[1]} ${rest}`;
  if (!looksLikeMeasurementContext(candidate)) return line;

  const frac = toFraction(value, 16);
  if (!frac) return line;

  const pretty = fractionToString(frac.whole, frac.num, frac.den);
  return `${pretty} ${rest}`.trim();
}

export function cleanIngredientLines(input: unknown): string[] {
  if (!input) return [];
  const arr = Array.isArray(input)
    ? input.map((v) => (typeof v === "string" ? v : String(v)))
    : String(input).split("\n");

  const cleaned = arr
    .map((s) => stripBullets(s))
    .map((s) => normalizeSpaces(s))
    .filter(Boolean)
    .map((s) => convertLeadingDecimalToFraction(s));

  // Remove exact duplicates while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of cleaned) {
    const key = line.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(line);
    }
  }
  return out;
}
