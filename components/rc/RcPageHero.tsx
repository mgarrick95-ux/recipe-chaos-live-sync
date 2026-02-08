// components/rc/RcPageHero.tsx
"use client";

import type React from "react";
import { useMemo } from "react";

export type RcChaosItem = {
  id: string;

  /**
   * Placeholder now:
   *  - emoji: "🥫"
   *
   * Future:
   *  - src: "/assets/3d/can.webp"
   *
   * Keep both supported so swapping is painless later.
   */
  emoji?: string;
  src?: string;
  alt?: string;

  /**
   * Optional styling knobs (you already use these in frostpantry/page.tsx).
   * If omitted, we generate sane defaults.
   */
  size?: number; // px
  opacity?: number; // 0..1
  blur?: number; // px
};

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function RcPageHero({
  title,
  tagline,
  rightSlot,
  pillsSlot,
  height = 320,
  chaos = [],
}: {
  title: string;
  tagline?: string;
  rightSlot?: React.ReactNode;
  pillsSlot?: React.ReactNode;
  height?: number;
  chaos?: RcChaosItem[];
}) {
  const laidOut = useMemo(() => {
    const items = chaos ?? [];
    const n = items.length;

    // Explosion ring bounds (px from center)
    const minR = 140;
    const maxR = 310;

    return items.map((it, idx) => {
      const rand = mulberry32(1337 + idx * 97);

      // Spread evenly around a ring, add jitter so it feels like an outward burst.
      const jitterDeg = (rand() - 0.5) * 26; // +/- 13deg
      const angleDeg = idx * (360 / Math.max(1, n)) + jitterDeg;

      const radius = minR + rand() * (maxR - minR);

      const size = typeof it.size === "number" ? it.size : 28 + Math.round(rand() * 26); // 28..54
      const opacity = typeof it.opacity === "number" ? it.opacity : 0.9;
      const blur = typeof it.blur === "number" ? it.blur : rand() < 0.18 ? 1 : 0;

      const rotation = (rand() - 0.5) * 28; // -14..+14deg

      const floatDur = 6 + rand() * 6; // 6..12
      const floatDelay = rand() * 2.5;

      const rad = (angleDeg * Math.PI) / 180;
      const x = Math.cos(rad) * radius;
      const y = Math.sin(rad) * radius;

      return {
        ...it,
        x,
        y,
        size,
        opacity,
        blur,
        rotation,
        floatDur,
        floatDelay,
      };
    });
  }, [chaos]);

  return (
    <section
      className={[
        "relative w-full overflow-hidden rounded-3xl ring-1 ring-white/10",
        "bg-gradient-to-br from-[#0b1026] via-[#071a2a] to-[#071f22]",
      ].join(" ")}
      style={{ minHeight: height }}
    >
      {/* Soft glow behind the title */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="h-[520px] w-[520px] rounded-full blur-3xl opacity-60 bg-[radial-gradient(circle,rgba(255,255,255,0.10)_0%,transparent_65%)]" />
      </div>

      {/* Chaos layer */}
      <div className="absolute inset-0 pointer-events-none">
        {laidOut.map((it) => {
          const hasEmoji = typeof it.emoji === "string" && it.emoji.trim().length > 0;
          const hasSrc = typeof it.src === "string" && it.src.trim().length > 0;

          if (!hasEmoji && !hasSrc) return null;

          return (
            <div
              key={it.id}
              className="absolute left-1/2 top-[44%] z-0"
              style={{
                transform: `translate(-50%, -50%) translate(${it.x}px, ${it.y}px) rotate(${it.rotation}deg)`,
                opacity: it.opacity,
                filter: it.blur ? `blur(${it.blur}px)` : undefined,
              }}
              aria-hidden
            >
              {/* inner wrapper floats so the outer transform stays stable */}
              <div
                className="will-change-transform"
                style={{
                  animation: `rc-floatY ${it.floatDur}s ease-in-out ${it.floatDelay}s infinite`,
                }}
              >
                {hasEmoji ? (
                  <div style={{ fontSize: it.size, lineHeight: 1 }}>{it.emoji}</div>
                ) : (
                  <img
                    src={it.src!}
                    alt={it.alt ?? ""}
                    draggable={false}
                    style={{
                      width: it.size,
                      height: it.size,
                      objectFit: "contain",
                      display: "block",
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* extra burst sparkles */}
        <div
          className="absolute left-1/2 top-[44%] pointer-events-none opacity-40"
          style={{
            transform: "translate(-50%, -50%)",
            animation: "rc-pulse 5.5s ease-in-out infinite",
          }}
          aria-hidden
        >
          <div className="h-[220px] w-[220px] rounded-full blur-2xl bg-[radial-gradient(circle,rgba(34,211,238,0.20)_0%,transparent_70%)]" />
        </div>
      </div>

      {/* Right pinned slot (Add, etc.) */}
      <div className="absolute right-6 top-6 z-20">{rightSlot}</div>

      {/* Centered content */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 py-10 text-center">
        <h1 className="text-white font-extrabold tracking-tight text-[clamp(2.6rem,6vw,4.6rem)]">
          {title}{" "}
          <span className="inline-block align-middle ml-2 h-3 w-3 rounded-full bg-white/60 shadow-[0_0_30px_rgba(255,255,255,0.25)]" />
        </h1>

        {tagline ? (
          <p className="mt-4 text-white/75 text-[clamp(1.05rem,2vw,1.35rem)]">
            {tagline}
          </p>
        ) : null}

        {pillsSlot ? <div className="mt-8">{pillsSlot}</div> : null}
      </div>

      <style jsx>{`
        @keyframes rc-floatY {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
          100% {
            transform: translateY(0px);
          }
        }

        @keyframes rc-pulse {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.35;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.06);
            opacity: 0.55;
          }
          100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.35;
          }
        }
      `}</style>
    </section>
  );
}
