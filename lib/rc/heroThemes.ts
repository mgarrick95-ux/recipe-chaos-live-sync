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