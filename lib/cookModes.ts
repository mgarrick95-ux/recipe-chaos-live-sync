// lib/cookModes.ts

export type CookMode = "standard" | "oven" | "airfryer" | "ninjacombi";

export function cookModeLabel(mode: CookMode): string {
  if (mode === "standard") return "Standard";
  if (mode === "oven") return "Oven Helper";
  if (mode === "airfryer") return "Air Fry Helper";
  return "Ninja Combi Helper";
}

export function cookModeNotes(mode: CookMode): string[] {
  switch (mode) {
    case "oven":
      return [
        "If the recipe is stovetop-only, use Oven Helper for warming/holding or finishing (when appropriate).",
        "General conversions: 350°F is a safe default; check early and adjust.",
        "Always confirm doneness (especially poultry/pork).",
      ];
    case "airfryer":
      return [
        "Air fryers cook faster and drier: reduce time and check early.",
        "General rule: drop temp ~25°F vs oven and start checking ~30% earlier.",
        "If breaded: a light spray of oil helps browning.",
      ];
    case "ninjacombi":
      return [
        "Combi modes = steam + heat, so food stays juicier and cooks faster.",
        "Use Combi Bake for casseroles/bakes; Combi Crisp for browning at the end.",
        "If reheating: Steam or Combi Reheat-style works great for leftovers.",
      ];
    default:
      return [
        "Standard mode follows the recipe as written.",
        "Use Cook Mode for step-by-step + ingredient check-off.",
      ];
  }
}
