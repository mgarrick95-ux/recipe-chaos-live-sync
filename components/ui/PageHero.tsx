// components/ui/PageHero.tsx
"use client";

import React from "react";

export type ChaosTheme = "recipes" | "pantry" | "shopping" | "planning";

type Sticker = {
  // For now these are emojis (your current setup).
  // Later we'll swap to SVG/PNG assets with the same positioning shape.
  emoji: string;
  top: string; // e.g. "16%"
  left: string; // e.g. "74%"
  size?: string; // e.g. "66px"
  rotate?: string; // e.g. "10deg"
  opacity?: string; // e.g. "0.95"
};

type PageHeroProps = {
  title: string;
  subtitle: string;

  /**
   * Optional right-side action (e.g. Add recipe button)
   */
  action?: React.ReactNode;

  /**
   * Optional content row inside the hero (your tabs live here)
   */
  children?: React.ReactNode;

  /**
   * Optional floating stickers (emoji now, images later)
   */
  stickers?: Sticker[];

  /**
   * Chaos background theme.
   * Expects /public/chaos/<theme>.svg to exist.
   */
  chaosTheme?: ChaosTheme;

  /**
   * Adjust the chaos layer visibility (0..1).
   */
  chaosOpacity?: number;

  className?: string;
};

const chaosBgByTheme: Record<ChaosTheme, string> = {
  recipes: "/chaos/recipes.svg",
  pantry: "/chaos/pantry.svg",
  shopping: "/chaos/shopping.svg",
  planning: "/chaos/planning.svg",
};

export default function PageHero({
  title,
  subtitle,
  action,
  children,
  stickers,
  chaosTheme = "recipes",
  chaosOpacity = 0.85,
  className = "",
}: PageHeroProps) {
  const bg = chaosBgByTheme[chaosTheme];

  return (
    <section
      className={
        "relative overflow-hidden rounded-[36px] " +
        "ring-1 ring-[var(--border)] " +
        "bg-[rgba(255,255,255,0.03)] " +
        "px-6 py-10 md:px-10 md:py-14 " +
        className
      }
    >
      {/* Chaos image layer (hero-only, clipped, non-interactive) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${bg})`,
          opacity: chaosOpacity,
        }}
      />

      {/* Existing “calm chaos” gradient layer (keeps your current vibe).
          When TJ art arrives, we can reduce this, but it’s a good bridge. */}
      <div aria-hidden className="rc-hero__chaos pointer-events-none" />

      {/* Soft vignette to keep text readable */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[#050816]/35"
      />

      {/* Floating stickers (placeholders until real assets) */}
      {Array.isArray(stickers) && stickers.length > 0 ? (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {stickers.map((s, idx) => (
            <div
              key={`${s.emoji}-${idx}`}
              style={{
                position: "absolute",
                top: s.top,
                left: s.left,
                fontSize: s.size || "56px",
                transform: `rotate(${s.rotate || "0deg"})`,
                opacity: s.opacity ? Number(s.opacity) : 0.9,
                filter: "drop-shadow(0 12px 22px rgba(0,0,0,0.35))",
              }}
            >
              {s.emoji}
            </div>
          ))}
        </div>
      ) : null}

      {/* Foreground */}
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            {/* Title: graffiti font ONLY if you set --font-chaos later */}
            <h1
              className="text-5xl md:text-7xl leading-[0.95] tracking-tight text-white"
              style={{
                fontFamily:
                  "var(--font-chaos, var(--font-space-grotesk), ui-sans-serif, system-ui)",
              }}
            >
              {title}
            </h1>

            <p className="mt-4 text-lg md:text-xl text-white/75 max-w-2xl">
              {subtitle}
            </p>
          </div>

          {action ? <div className="mt-2 md:mt-0">{action}</div> : null}
        </div>

        {children ? <div className="mt-8">{children}</div> : null}
      </div>
    </section>
  );
}
