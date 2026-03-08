$ErrorActionPreference = "Stop"

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $fullPath = Join-Path (Get-Location) $Path
    $dir = Split-Path $fullPath -Parent

    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($fullPath, $Content, $utf8NoBom)
    Write-Host "Wrote $Path"
}

# =========================================================
# app/api/recipes/route.ts
# Replace supabaseServer -> supabase
# =========================================================
$recipeRoute = Get-Content "app/api/recipes/route.ts" -Raw -Encoding UTF8
$recipeRoute = $recipeRoute.Replace("const { data, error } = await supabaseServer", "const { data, error } = await supabase")
Write-Utf8NoBom -Path "app/api/recipes/route.ts" -Content $recipeRoute

# =========================================================
# app/frostpantry/page.tsx
# Match current RcPageHero props
# =========================================================
$frost = Get-Content "app/frostpantry/page.tsx" -Raw -Encoding UTF8
$frost = $frost.Replace("chaosItems={heroChaos}", "chaos={heroChaos}")
$frost = $frost.Replace('heightClass="min-h-[310px]"', "height={310}")
Write-Utf8NoBom -Path "app/frostpantry/page.tsx" -Content $frost

# =========================================================
# lib/rc/heroThemes.ts
# Rewrite with ASCII-safe content only
# =========================================================
$heroThemes = @'
// lib/rc/heroThemes.ts
import type { RcChaosItem } from "@/components/rc/RcPageHero";

export type RcHeroTheme = {
  backgroundClass: string;
  glowClass: string;
  glow2Class: string;
  accentDotClass: string;
};

export type RcPageHeroPreset = {
  title: string;
  tagline?: string;
  theme: RcHeroTheme;
  chaos: RcChaosItem[];
};

export const frostPantryHero: RcPageHeroPreset = {
  title: "Pantry & Freezer",
  tagline: "What's around, more or less.",
  theme: {
    backgroundClass: "bg-gradient-to-br from-[#0B1026] via-[#0A0F22] to-[#080B18]",
    glowClass: "bg-fuchsia-500/12",
    glow2Class: "bg-cyan-400/10",
    accentDotClass: "bg-fuchsia-400"
  },
  chaos: [
    { id: "can", emoji: "*" },
    { id: "ice", emoji: "*" },
    { id: "bread", emoji: "*" },
    { id: "cheese", emoji: "*" },
    { id: "milk", emoji: "*" },
    { id: "jar", emoji: "*" },
    { id: "label", emoji: "*" },
    { id: "spark", emoji: "*" }
  ]
};

export const recipesHero: RcPageHeroPreset = {
  title: "Recipes",
  tagline: "No rules. No pressure. Just food.",
  theme: {
    backgroundClass: "bg-gradient-to-br from-[#2A004E] via-[#0D0F25] to-[#070816]",
    glowClass: "bg-fuchsia-500/14",
    glow2Class: "bg-emerald-400/10",
    accentDotClass: "bg-fuchsia-400"
  },
  chaos: [
    { id: "carrot", emoji: "*" },
    { id: "garlic", emoji: "*" },
    { id: "book", emoji: "*" },
    { id: "knife", emoji: "*" },
    { id: "bowl", emoji: "*" },
    { id: "spark", emoji: "*" }
  ]
};
'@
Write-Utf8NoBom -Path "lib/rc/heroThemes.ts" -Content $heroThemes

# =========================================================
# lib/shopping/normalize.ts
# Add normalizeName export if missing
# =========================================================
$normalize = Get-Content "lib/shopping/normalize.ts" -Raw -Encoding UTF8

if ($normalize -notmatch "export function normalizeName\(") {
    $normalize = $normalize + @'

export function normalizeName(input: string): string {
  return normalizeShoppingListInput(input).normalizedName;
}
'@
}

Write-Utf8NoBom -Path "lib/shopping/normalize.ts" -Content $normalize

Write-Host ""
Write-Host "Patch pass complete."
Write-Host "Now run: npx tsc --noEmit"