// components/ui/PageHero.tsx
"use client";

import React from "react";

export type ChaosTheme = "recipes" | "pantry" | "shopping" | "planning";

type Sticker = {
  emoji: string;
  top: string;
  left: string;
  size?: string;
  rotate?: string;
  opacity?: string;
};

type PageHeroProps = {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  stickers?: Sticker[];
  chaosTheme?: ChaosTheme;
  chaosOpacity?: number;
  className?: string;
};

export default function PageHero({
  title,
  subtitle,
  action,
  children,
  className = "",
}: PageHeroProps) {
  return (
    <section
      className={[
        "rounded-[36px] bg-[color:var(--card)] ring-1 ring-[color:var(--border)]",
        "px-6 py-10 md:px-10 md:py-14 shadow-sm",
        className,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-5xl md:text-7xl leading-[0.95] tracking-tight text-[color:var(--text)]"
            style={{
              fontFamily:
                "var(--font-chaos, var(--font-space-grotesk), ui-sans-serif, system-ui)",
            }}
          >
            {title}
          </h1>

          <p className="mt-4 text-lg md:text-xl text-[color:var(--muted)] max-w-2xl">
            {subtitle}
          </p>
        </div>

        {action ? <div className="mt-2 md:mt-0">{action}</div> : null}
      </div>

      {children ? <div className="mt-8">{children}</div> : null}
    </section>
  );
}
