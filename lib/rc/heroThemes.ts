// lib/rc/heroThemes.ts
import type { RcChaosObject, RcHeroTheme } from "@/components/rc/RcPageHero";

export type RcPageHeroPreset = {
  title: string;
  tagline?: string;
  theme: RcHeroTheme;
  chaos: RcChaosObject[];
};

export const frostPantryHero: RcPageHeroPreset = {
  title: "Pantry & Freezer",
  tagline: "What’s around, more or less.",
  theme: {
    backgroundClass: "bg-gradient-to-br from-[#0B1026] via-[#0A0F22] to-[#080B18]",
    glowClass: "bg-fuchsia-500/12",
    glow2Class: "bg-cyan-400/10",
    accentDotClass: "bg-fuchsia-400",
  },
  chaos: [
    { id: "can", emoji: "🥫", depth: 2 },
    { id: "ice", emoji: "🧊", depth: 3 },
    { id: "bread", emoji: "🍞", depth: 1 },
    { id: "cheese", emoji: "🧀", depth: 2 },
    { id: "milk", emoji: "🥛", depth: 1 },
    { id: "jar", emoji: "🫙", depth: 2 },
    { id: "label", emoji: "🏷️", depth: 1 },
    { id: "spark", emoji: "✨", depth: 3 },
  ],
};

// Placeholder presets for later (same frame, different vibes)
export const recipesHero: RcPageHeroPreset = {
  title: "Recipes",
  tagline: "No rules. No pressure. Just food.",
  theme: {
    backgroundClass: "bg-gradient-to-br from-[#2A004E] via-[#0D0F25] to-[#070816]",
    glowClass: "bg-fuchsia-500/14",
    glow2Class: "bg-emerald-400/10",
    accentDotClass: "bg-fuchsia-400",
  },
  chaos: [
    { id: "carrot", emoji: "🥕", depth: 2 },
    { id: "garlic", emoji: "🧄", depth: 3 },
    { id: "book", emoji: "📖", depth: 1 },
    { id: "knife", emoji: "🔪", depth: 2 },
    { id: "bowl", emoji: "🥣", depth: 1 },
    { id: "spark", emoji: "✨", depth: 3 },
  ],
};
