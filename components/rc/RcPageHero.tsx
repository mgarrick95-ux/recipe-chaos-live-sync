// components/rc/RcPageHero.tsx
"use client";

import type React from "react";

export type RcChaosItem = {
  id: string;
  emoji?: string;
  src?: string;
  alt?: string;
  size?: number;
  opacity?: number;
  blur?: number;
};

export default function RcPageHero({
  title,
  tagline,
  rightSlot,
  pillsSlot,
  height,
}: {
  title: string;
  tagline?: string;
  rightSlot?: React.ReactNode;
  pillsSlot?: React.ReactNode;
  height?: number;
  chaos?: RcChaosItem[];
}) {
  return (
    <section
      className="rounded-[36px] bg-[color:var(--card)] px-6 py-10 ring-1 ring-[color:var(--border)] md:px-10 md:py-14"
      style={height ? { minHeight: Math.min(height, 260) } : undefined}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-[color:var(--text)]">
            {title}
          </h1>

          {tagline ? (
            <p className="mt-4 text-lg md:text-xl text-[color:var(--muted)]">
              {tagline}
            </p>
          ) : null}
        </div>

        {rightSlot ? <div className="mt-2 md:mt-0">{rightSlot}</div> : null}
      </div>

      {pillsSlot ? <div className="mt-8">{pillsSlot}</div> : null}
    </section>
  );
}
